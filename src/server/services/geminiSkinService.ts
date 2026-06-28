/**
 * Google Gemini 2.5 Flash Vision skin-analysis service.
 *
 * 2026-06-26 — added because `api-inference.huggingface.co` was observed
 * unreachable from Vercel network (FetchError in 24ms, see Vercel
 * runtime logs). Gemini's `generativelanguage.googleapis.com` endpoint
 * IS reachable from Vercel — confirmed by parallel tests. The orchestrator
 * runs Face++ + Gemini + HuggingFace in parallel; the user sees up
 * to 3 variants in the ResultModal tab switcher. Or, when the user
 * explicitly picks a single provider in AnalysisInput, only that one runs.
 *
 * 2026-06-27 — model swapped from `gemini-2.5-pro` → `gemini-2.5-flash`
 * per user instruction. Flash is ~3× faster on cold-start, has higher
 * free-tier rate limits (15 RPM vs Pro's 5 RPM), and is permissive with
 * GEMINI_API_KEY from Google AI Studio. Schema output is identical
 * (responseSchema is model-agnostic) so the downstream scoring pipeline
 * is unchanged. Pro can be re-introduced later as a paid-tier upgrade
 * by setting `GEMINI_MODEL=gemini-2.5-pro` env var (not yet wired).
 *
 * 2026-06-28 — verdict cache wrapper around `callGemini`. Same photo
 * (double-tap submit, JS retry on transient error) re-uses the cached
 * raw envelope instead of re-billing the 60s cold-boot to Google.
 * Public `analyzeSkinWithGemini` still does feature-bag extraction +
 * scoring on every call (~1ms), so a future tweak to severity
 * thresholds picks up the latest verdict shape without waiting for
 * cache TTL.
 *
 * Uses `gemini-2.5-flash` model with structured JSON output
 * (`responseMimeType: "application/json"` + `responseSchema`). The model
 * returns 8 skin-feature values with confidence, plus a `skin_type`
 * integer (0=сухая, 1=жирная, 2=комбинированная, 3=нормальная).
 *
 * Schema-shape strategy
 * ─────────────────────
 * We deliberately use Face++'s SAME feature names and value/confidence
 * shape so the existing scoring pipeline works without special-casing
 * the new provider. The synthesized `_rawResponse` is a thin wrapper
 * around Gemini's JSON output (it's NOT a FacePlusResult shape, since
 * Gemini returns flat structure; orchestrator persists it to
 * `SkinAnalysis.rawGemini` JSONB column separately from
 * `rawFacePlus` / `rawHuggingFace`).
 *
 * Error model
 * ────────────
 * Two structured subclasses mirror HF's pattern so the orchestrator's
 * `instanceof` check is the single point of truth.
 *
 * - `GeminiConfigError`   → operator didn't set GEMINI_API_KEY
 * - `GeminiUpstreamError` → network / non-2xx / unparseable body /
 *                           model returned nothing useful
 *
 * Circuit-breaker (2026-06-26, mirrors HF):
 * On any `GeminiUpstreamError`, tripGeminiCircuit() extends the breaker
 * TTL by 60s. Next call within the window short-circuits with the same
 * error class so the orchestrator routes it cleanly.
 */
import type { AnalysisVerdict } from "./facePlusService";
import { memoize } from "../utils/llmCache";
import {
  MIN_CONFIDENCE,
  PROBLEM_MAP,
  RECOMMENDATIONS_MAP,
  SKIN_TYPE_MAP,
  buildRoutine,
  generateProductLinks,
  isBogusResult,
  severityFromValue,
  weightedSkinScore,
} from "../utils/skinScoring";

/**
 * Thrown by `analyzeSkinWithGemini` when `GEMINI_API_KEY` is missing on
 * the server. Orchestrator catches and surfaces a friendly Russian
 * message; the user never sees a raw env error.
 */
export class GeminiConfigError extends Error {
  constructor(message = "Gemini API key is not configured") {
    super(message);
    this.name = "GeminiConfigError";
  }
}

/**
 * Thrown by `analyzeSkinWithGemini` for transient upstream failures:
 * network unreachable, non-2xx HTTP response, response body without a
 * usable JSON in `candidates[0].content.parts[0].text`, schema parse
 * failure, etc.
 */
export class GeminiUpstreamError extends Error {
  constructor(message = "Gemini upstream failed") {
    super(message);
    this.name = "GeminiUpstreamError";
  }
}

// User pre-choice mode (gemini-2.5-flash) — see file header. Flash is
// the production-default model. Pro was previously the default; the
// swap was made because flash has higher free-tier quotas (15 RPM,
// 50 RPD vs Pro 5 RPM, 2 RPD) and lower latency on cold-start.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Gemini cold-start for image input can take 5-15s on Free tier; Pro tier
// is faster but the same 60s budget is comfortable headroom.
// Falls under Vercel Free tier's 10s only on warm subsequent calls —
// which is also when the circuit breaker is most useful.
const GEMINI_TIMEOUT_MS = 60_000;

// 2026-06-26 — circuit breaker (mirrors HF pattern). On the FIRST
// GeminiUpstreamError, the breaker trips for GEMINI_CIRCUIT_TTL_MS so
// subsequent calls in the same minute skip the outbound fetch entirely.
// Saves 10-60s of latency per call when Gemini is unreachable / quota
// exhausted / rate-limited.
const GEMINI_CIRCUIT_TTL_MS = 60_000;
let lastGeminiFailureAt: number | null = null;
function tripGeminiCircuit(): void {
  lastGeminiFailureAt = Date.now();
}
function isGeminiCircuitOpen(): boolean {
  return lastGeminiFailureAt !== null && Date.now() - lastGeminiFailureAt < GEMINI_CIRCUIT_TTL_MS;
}

// ── Russian prompt for Gemini to evaluate facial skin ─────────────
// Structured-output prompt — Gemini 2.5 Pro with responseSchema gets
// reliable per-feature value/severity + confidence because the schema
// constrains the response shape.
//
// `value`: 0 = не выявлено, 30 = лёгкое, 60 = умеренное, 100 = выраженное.
// `confidence`: 0.0 — 1.0; below MIN_CONFIDENCE (0.4) means the feature
// is silently filtered out of the skin-score weighting pipeline.
const GEMINI_PROMPT_TEXT =
  `Ты профессиональный дерматолог-анализатор, работающий с приложением по уходу за кожей.
Оцени фото лица пользователя и верни строго JSON по схеме.

ВАЖНО:
- Ответ должен быть ТОЛЬКО валидный JSON без пояснений, без текста вне JSON, без markdown-блоков.
- Не выдумывай данных: если признак невозможно оценить (плохое освещение, лицо не анфас,
  часть лица скрыта) — поставь value=0 и confidence=0.
- Все confidence в диапазоне от 0.0 до 1.0.
- Все value: 0 = не выявлено, 30 = лёгкое, 60 = умеренное, 100 = выраженное.

ПАРАМЕТРЫ:
- skin_type: целое число 0, 1, 2 или 3:
  0 = сухая, 1 = жирная, 2 = комбинированная, 3 = нормальная.
  Если невозможно определить — поставь 3 (нормальная).

Признаки кожи — для каждого { value: 0|30|60|100, confidence: 0.0–1.0 }:
- acne: воспаления (прыщи, папулы, пустулы)
- dark_circle: тёмные круги под глазами
- pore: расширенные поры
- spot: пигментация (постакне, солнечные пятна, мелазма)
- wrinkle: морщины (мимические и возрастные)
- blackhead: открытые комедоны (чёрные точки)
- eye_pouch: мешки под глазами (припухлость нижнего века)
- eyelids: отёчность верхних век`;

// Gemini's responseSchema — matches our prompt output structure (flat).
// Type STRING for INTEGER fields because Gemini's schema enum doesn't
// support arbitrary integer ranges well in v1beta — we coerce in
// parseGeminiResponse() below.
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    skin_type: { type: "NUMBER" },
    acne: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
    dark_circle: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
    pore: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
    spot: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
    wrinkle: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
    blackhead: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
    eye_pouch: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
    eyelids: {
      type: "OBJECT",
      properties: {
        value: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
      },
      required: ["value", "confidence"],
    },
  },
  required: [
    "skin_type",
    "acne",
    "dark_circle",
    "pore",
    "spot",
    "wrinkle",
    "blackhead",
    "eye_pouch",
    "eyelids",
  ],
} as const;

/**
 * Internal raw shape returned by Gemini (matches the response schema).
 */
interface GeminiSkinVerdictRaw {
  skin_type: number;
  acne: { value: number; confidence: number };
  dark_circle: { value: number; confidence: number };
  pore: { value: number; confidence: number };
  spot: { value: number; confidence: number };
  wrinkle: { value: number; confidence: number };
  blackhead: { value: number; confidence: number };
  eye_pouch: { value: number; confidence: number };
  eyelids: { value: number; confidence: number };
}

/**
 * 2026-06-28 — Cache key derivation for Gemini skin analysis. We hash
 * the FIRST 1024 chars of cleanBase64 (after stripping the data URL
 * prefix). Photos that share enough leading JPEG bytes are visually
 * identical for our purposes — client-side `compressImage`
 * deterministically resizes to 1080px JPEG/0.85 quality, so the file
 * header is stable across re-sends of the same photo. Full-base64 sha256
 * would cost ~5-10ms; first 1KB uniquely tags a JPEG with its stable
 * quantization table and similar leading DCT coefficients.
 *
 * Used by `callGemini` (the memoized wrapper) as the keyParts array
 * input — `memoize()` lower-cases and joins these into one string for
 * the SHA-256 hash.
 */
function geminiCacheKey(cleanBase64: string): string {
  return cleanBase64.slice(0, 1024);
}

/**
 * Memoized wrapper. Same photo (double-tap submit, JS retry, network
 * jitter retry) re-uses the cached envelope instead of re-billing
 * Google's 15 RPM free-tier quota. TTL 24h (per the singleton config in
 * `../utils/llmCache`). Cache misses still pay the cold-boot price
 * once; subsequent retries on the same photo skip it.
 */
async function callGemini(cleanBase64: string): Promise<GeminiSkinVerdictRaw> {
  return memoize(
    "gemini:verdict",
    [geminiCacheKey(cleanBase64)],
    () => callGeminiUncached(cleanBase64),
  );
}

/**
 * Internal: call Gemini Vision API. Returns the parsed JSON verdict
 * matching `GeminiSkinVerdictRaw`. Throws `GeminiConfigError` /
 * `GeminiUpstreamError` on unrecoverable failure.
 *
 * Does NOT trip the circuit breaker directly — the single trip-point
 * lives in `analyzeSkinWithGemini`'s try/catch below, identical to the
 * HF pattern. This matches all thrown errors in one place so the same
 * breaker type handles network, HTTP, parse failures identically.
 */
async function callGeminiUncached(cleanBase64: string): Promise<GeminiSkinVerdictRaw> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiConfigError(
      "Gemini fallback activated but GEMINI_API_KEY is not configured on the server.",
    );
  }

  let res: Response;
  try {
    res = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: GEMINI_PROMPT_TEXT },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (e: any) {
    // Network reach failure (DNS, ECONNREFUSED, TLS, timeout). Typed wrap
    // so the orchestrator sees a GeminiUpstreamError regardless of cause.
    throw new GeminiUpstreamError(
      `Gemini network unreachable: ${e?.message ?? String(e)}`,
    );
  }

  const raw = await res.text();
  let outerJson: any;
  try {
    outerJson = JSON.parse(raw);
  } catch {
    throw new GeminiUpstreamError(
      `Gemini returned non-JSON (status ${res.status}): ${raw.slice(0, 200)}`,
    );
  }

  if (!res.ok) {
    throw new GeminiUpstreamError(
      `Gemini error ${res.status}: ${JSON.stringify(outerJson).slice(0, 200)}`,
    );
  }

  // Gemini's envelope: { candidates: [{ content: { parts: [{ text: "{...}" }] } }] }
  // Even with responseMimeType: "application/json", the result is wrapped
  // inside candidates[0].content.parts[0].text as a JSON string.
  const textPayload: string | undefined =
    outerJson?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textPayload) {
    throw new GeminiUpstreamError(
      `Gemini response missing candidates[0].content.parts[0].text: ${JSON.stringify(outerJson).slice(0, 200)}`,
    );
  }

  let verdict: GeminiSkinVerdictRaw;
  try {
    verdict = JSON.parse(textPayload);
  } catch {
    // Sometimes Gemini's responseMimetype forces a JSON envelope even
    // when content is non-JSON, e.g. on quota errors with text. Fallback
    // attempt: try to coerce values from the nested object directly.
    verdict = textPayload as unknown as GeminiSkinVerdictRaw;
  }

  // Sanity-check required fields; if Gemini returned an unexpected
  // shape we trip the circuit breaker upstream, but here we just
  // throw a typed error.
  if (
    !verdict ||
    typeof verdict.skin_type !== "number" ||
    !verdict.acne ||
    typeof verdict.acne.value !== "number" ||
    typeof verdict.acne.confidence !== "number"
  ) {
    throw new GeminiUpstreamError(
      `Gemini verdict missing required fields: ${JSON.stringify(verdict).slice(0, 200)}`,
    );
  }

  return verdict;
}

/**
 * Public entry point. Mirrors `analyzeSkinWithFacePlus` and
 * `analyzeSkinWithHuggingFace` signatures so the orchestrator can swap
 * providers via a uniform interface.
 *
 * Returns an `AnalysisVerdict` with `data_quality: "partial"`. Gemini
 * returns ALL 8 features, so technically it could be labelled "full",
 * but we keep "partial" to signal to the UI that this is a Vision-LLM
 * verdict rather than a structured-data specialist (Face++). ResultModal
 * renders the same "Сервис анализа в ограниченном режиме" banner — fine,
 * since the user gets the FULL set of problems anyway.
 *
 * 2026-06-26 — circuit breaker: short-circuits with GeminiUpstreamError
 * if Gemini failed in the last GEMINI_CIRCUIT_TTL_MS. Single trip-point
 * below: any GeminiUpstreamError caught extends the breaker TTL.
 */
export async function analyzeSkinWithGemini(
  imageBase64: string,
): Promise<AnalysisVerdict> {
  // 2026-06-26 — circuit breaker: if Gemini failed recently, skip the
  // call entirely. When Vercel is rate-limited by Google's free tier we
  // hit 429 errors; the breaker prevents each subsequent call from
  // burning the 60s timeout window.
  if (isGeminiCircuitOpen()) {
    const ageSec = Math.round(((Date.now() - (lastGeminiFailureAt ?? Date.now())) / 1000));
    console.warn(
      `[Gemini] Circuit breaker OPEN — skipping call (last failure ${ageSec}s ago, TTL ${GEMINI_CIRCUIT_TTL_MS / 1000}s).`,
    );
    throw new GeminiUpstreamError(
      `Gemini circuit breaker open (last failure ${ageSec}s ago).`,
    );
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const sizeKB = Math.round((cleanBase64.length * 3) / 4 / 1024);
  if (sizeKB < 10) {
    throw new Error("Фото слишком маленькое. Сделайте новый снимок.");
  }

  console.log(`[Gemini] Calling ${GEMINI_MODEL} (${sizeKB}KB)…`);
  // Single trip-point for the circuit breaker: ANY GeminiUpstreamError
  // from any inner path (network, HTTP non-2xx, parse, schema) trips
  // the breaker. Single chokepoint, same pattern as HF.
  let raw: GeminiSkinVerdictRaw;
  try {
    raw = await callGemini(cleanBase64);
  } catch (e: any) {
    if (e instanceof GeminiUpstreamError) {
      tripGeminiCircuit();
    }
    throw e;
  }
  console.log(
    `[Gemini] Returned verdict: skin_type=${raw.skin_type}, acne.value=${raw.acne.value}, acne.conf=${raw.acne.confidence}`,
  );

  // ── Build features bag (matches Face++ contract) ──────────────────
  const features: Record<string, { value: number; confidence: number }> = {
    acne: clampFeature(raw.acne),
    dark_circle: clampFeature(raw.dark_circle),
    pore: clampFeature(raw.pore),
    spot: clampFeature(raw.spot),
    wrinkle: clampFeature(raw.wrinkle),
    blackhead: clampFeature(raw.blackhead),
    eye_pouch: clampFeature(raw.eye_pouch),
    eyelids: clampFeature(raw.eyelids),
  };

  // Bogus detection — same gate as Face++ side. If Gemini hallucinates
  // an all-zero verdict when it actually saw a face, we drop the variant.
  const bogo = isBogusResult(features);

  // Build problem list from features.
  const problemEntries: { name: string; severity: "лёгкое" | "умеренное" | "выраженное" }[] = [];
  const recommendations: string[] = [];
  for (const [key, { value, confidence }] of Object.entries(features)) {
    if (confidence < MIN_CONFIDENCE) continue;
    const sev = severityFromValue(value);
    if (sev === null) continue;
    const problemName = PROBLEM_MAP[key];
    if (!problemName) continue;
    problemEntries.push({ name: problemName, severity: sev });
    const recs = RECOMMENDATIONS_MAP[key];
    if (recs) recommendations.push(...recs);
  }

  const skinTypeName = SKIN_TYPE_MAP[clampSkinType(raw.skin_type)];
  const skinScore = weightedSkinScore(features, problemEntries);
  const problems = problemEntries.map((p) => `${p.name} (${p.severity})`);

  const hasAcne = problemEntries.some((p) => p.name === "акне");

  const mood =
    problems.length >= 3 ? "тревожный" : problems.length >= 1 ? "нейтральный" : "позитивный";

  const dailyRoutine = buildRoutine(skinTypeName, problems, hasAcne);
  const productLinks = generateProductLinks(problems);

  // 2026-06-26 — Gemini returns ALL 8 features with confidence gating,
  // same as Face++. Re-classify verdict as "full" so the modal's
  // "Сервис анализа в ограниченном режиме" banner stays suppressed
  // when this provider is dominant. Bogus verdicts still surface as
  // "invalid" via the orchestrator's gate.
  return {
    skin_type: skinTypeName,
    problems,
    skin_score: skinScore,
    recommendations,
    daily_routine: dailyRoutine,
    mood,
    product_links: productLinks,
    // _rawResponse is the raw Gemini verdict (flat JSON shape from
    // responseSchema, NOT a FacePlusResult). Orchestrator persists it
    // to SkinAnalysis.rawGemini JSONB column.
    _rawResponse: raw as unknown as Record<string, unknown>,
    data_quality: bogo ? "invalid" : "full",
  };
}

// ── Local helpers specific to Gemini ────────────────────────────────
// SKIN_TYPE_MAP, buildRoutine, generateProductLinks are imported
// from ../utils/skinScoring.ts (shared with Face++).

function clampSkinType(v: unknown): number {
  const n = Math.round(Number(v) || 3);
  if (n < 0 || n > 3) return 3;
  return n;
}

function clampFeature(raw: { value: unknown; confidence: unknown }): {
  value: number;
  confidence: number;
} {
  const value = Math.max(0, Math.min(100, Number(raw.value) || 0));
  const conf = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  return { value, confidence: conf };
}
