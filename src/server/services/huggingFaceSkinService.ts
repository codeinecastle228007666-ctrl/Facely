/**
 * HuggingFace Inference API fallback for skin analysis.
 *
 * Activated by `analysisService.analyze` when Face++ returns a quota
 * error (e.g. INSUFFICIENT_BALANCE — which happened on 2026-06-25 when
 * the user's Free Plan balance dropped to $0 before they could top up).
 *
 * Uses `mufasabrownie/glowlytics-skin-models` — a YOLO-based object
 * detector fine-tuned for facial skin problems. The model returns
 * `[{label, score, box: {xmin, ymin, xmax, ymax}}]`, fundamentally
 * different from Face++'s `{value: 0/60/100, confidence}` per-feature
 * categorical output.
 *
 * Schema-normalization strategy
 * ─────────────────────────────
 * - HF-detected acne/spot/mole/wrinkle → mapped to a synthetic
 *   `{value: 60, confidence: <score>}` so the existing severityFromValue
 *   pipeline picks an "умеренное" severity and adds it to the problem
 *   list, recommendations, products, and routine generation.
 * - HF-undetected features (pore / dark_circle / blackhead / eye_pouch /
 *   eyelids) → zero confidence so MIN_CONFIDENCE gate ignores them
 *   in weightedSkinScore. This deliberately biases the skin_score
 *   upward for HF-fallback analyses — that's why we surface
 *   `data_quality: "partial"` to the UI; ResultModal uses this to
 *   render a "Сервис анализа в ограниченном режиме" banner instead
 *   of pretending we have a reliable skin score.
 * - Skin type: no HF model gives us a skin type. Default to
 *   "неопределён" (already handled by UI).
 *
 * Error model
 * ────────────
 * Two structured subclasses are exported so the orchestrator's
 * `instanceof` check is the single point of truth. NO string-match
 * fallbacks. If we ever change message text, behavior stays stable.
 *
 * - `HFConfigError`     → operator didn't set HF_TOKEN
 * - `HFUpstreamError`   → any transient upstream failure (network,
 *                         cold-start exhausted, non-2xx response,
 *                         unparseable body, etc.)
 */
import type {
  AnalysisVerdict,
  FacePlusResult,
  FacePlusItem,
} from "./facePlusService";
import {
  MIN_CONFIDENCE,
  PROBLEM_MAP,
  severityFromValue,
  weightedSkinScore,
} from "../utils/skinScoring";

/**
 * Thrown by `analyzeSkinWithHuggingFace` when the operator has not
 * configured the HuggingFace fallback (HF_TOKEN missing). Caught by
 * `analysisService.analyze` and translated into a friendly Russian
 * message instead of leaking infrastructure errors to the user.
 *
 * Symmetric to `AppQuotaExceededError` on the Face++ side — the
 * orchestrator uses `instanceof` checks for both, no string matching.
 */
export class HFConfigError extends Error {
  constructor(message = "HuggingFace token is not configured") {
    super(message);
    this.name = "HFConfigError";
  }
}

/**
 * Thrown by `analyzeSkinWithHuggingFace` for transient upstream
 * failures: network unreachable, non-2xx HTTP response, unparseable
 * body, model cold-start exhausted retries, etc. Same handling as
 * HFConfigError: orchestrator catches and re-throws a friendly
 * Russian message.
 */
export class HFUpstreamError extends Error {
  constructor(message = "HuggingFace upstream failed") {
    super(message);
    this.name = "HFUpstreamError";
  }
}

const HF_MODEL = "mufasabrownie/glowlytics-skin-models";
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
const HF_TIMEOUT_MS = 25_000;        // generous: cold start ~5-15s, then ~1-3s
const HF_COLD_START_RETRY_DELAY_MS = 6_000;
const HF_COLD_START_RETRY_COUNT = 1;

// ── Severity bucketing yolo "score" → "{value, confidence}" pair ─────
// YOLO confidence is 0–1 (we treat >= 0.5 as moderate; >= 0.8 as severe).
function hfSeverity(score: number): { value: number; confidence: number } {
  if (score >= 0.8) return { value: 100, confidence: score };       // "выраженное"
  if (score >= 0.5) return { value: 60, confidence: score };        // "умеренное"
  if (score >= 0.3) return { value: 30, confidence: score };        // "лёгкое"
  return { value: 0, confidence: score };                             // below threshold
}

// HF label → our PROBLEM_MAP key (the same keys facePlusService.PROBLEM_MAP
// expects). Unmapped labels are dropped (not all YOLO labels are useful).
//
// Explicit literal union (not `keyof typeof HF_LABEL_TO_FEATURE`) —
// the latter would be a self-referential type that TypeScript correctly
// rejects ("X is referenced directly or indirectly in its own type
// annotation"). HF can't detect more than this subset anyway.
type HFFeature = "acne" | "spot" | "mole" | "wrinkle";
const HF_LABEL_TO_FEATURE: Record<string, HFFeature> = {
  acne: "acne",
  pimple: "acne",
  spot: "spot",
  pigmentation: "spot",
  mole: "mole",
  wrinkle: "wrinkle",
  // HF model may emit other classes — silently ignored below.
  // nose/nostril/lip → deliberately NOT mapped (these are the false
  // positives the previous Groq overlay was dying on).
};

/**
 * Internal: call HF Inference API with 503 cold-start retry.
 * Returns the raw detection array or throws an HFConfigError /
 * HFUpstreamError subclass on unrecoverable failure.
 */
async function callHuggingFace(cleanBase64: string): Promise<Array<{
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}>> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new HFConfigError(
      "HuggingFace fallback activated but HF_TOKEN is not configured on the server.",
    );
  }

  const buffer = Buffer.from(cleanBase64, "base64");

  const doFetch = async () => {
    let res: Response;
    try {
      res = await fetch(HF_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
        signal: AbortSignal.timeout(HF_TIMEOUT_MS),
      });
    } catch (e: any) {
      // Network reach failure (DNS, ECONNREFUSED, TLS) — same handling
      // path as HTTP errors so the orchestrator doesn't leak the raw
      // fetch message to the user.
      throw new HFUpstreamError(
        `HuggingFace network unreachable: ${e?.message ?? String(e)}`,
      );
    }
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch {
      throw new HFUpstreamError(
        `HuggingFace returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`,
      );
    }

    // 503 = model is cold-booting. The body includes `{estimated_time: N}`.
    // We retry once after a short wait. If still 503, give up cleanly.
    if (res.status === 503) {
      const est = Math.ceil(json?.estimated_time ?? 6);
      return { retry_after_ms: est * 1000, body: json };
    }
    if (!res.ok) {
      throw new HFUpstreamError(
        `HuggingFace error ${res.status}: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    return { retry_after_ms: 0, body: json as Array<any> };
  };

  let attempt = 0;
  while (attempt <= HF_COLD_START_RETRY_COUNT) {
    const out = await doFetch();
    if (out.retry_after_ms === 0) return out.body;
    if (attempt === HF_COLD_START_RETRY_COUNT) {
      throw new HFUpstreamError(
        `HuggingFace model still warming after retry (estimated ${Math.ceil(out.retry_after_ms / 1000)}s). Try again in a minute.`,
      );
    }
    console.log(
      `[HuggingFace] Model cold, waiting ${Math.ceil(out.retry_after_ms / 1000)}s (attempt ${attempt + 1})…`,
    );
    await new Promise((r) => setTimeout(r, Math.min(out.retry_after_ms, HF_COLD_START_RETRY_DELAY_MS)));
    attempt++;
  }
  throw new HFUpstreamError("HuggingFace call exhausted retries.");
}

/**
 * Build a synthetic FacePlusResult from HF detections. Only fills the
 * features we can map from HF labels; everything else is zero-conf
 * (filtered out by MIN_CONFIDENCE=0.4 in weightedSkinScore).
 */
function synthesizeRawFacePlus(
  detections: Array<{ label: string; score: number }>,
): FacePlusResult {
  // Initialize all 16 face features to zero — they will stay at min confidence.
  const zero: FacePlusItem = { confidence: 0, value: 0 };
  const raw: FacePlusResult = {
    acne: { ...zero },
    dark_circle: { ...zero },
    skin_spot: { ...zero },
    pores_left_cheek: { ...zero },
    pores_right_cheek: { ...zero },
    pores_forehead: { ...zero },
    pores_jaw: { ...zero },
    nasolabial_fold: { ...zero },
    forehead_wrinkle: { ...zero },
    glabella_wrinkle: { ...zero },
    crows_feet: { ...zero },
    eye_finelines: { ...zero },
    eye_pouch: { ...zero },
    left_eyelids: { ...zero },
    right_eyelids: { ...zero },
    blackhead: { ...zero },
    mole: { ...zero },
    skin_type: {
      details: {
        "0": { confidence: 0, value: 0 },
        "1": { confidence: 0, value: 0 },
        "2": { confidence: 0, value: 0 },
        "3": { confidence: 0, value: 0 },
      },
      skin_type: 0,
    },
  };

  // Aggregate per-feature: keep the highest-confidence detection per
  // feature. So multiple low-confidence acne detections don't compound
  // (a noisy result with score 0.45 wouldn't trigger but a clear
  // single detection at 0.91 would).
  const perFeature: Record<string, { value: number; confidence: number }> = {};
  for (const det of detections) {
    const feature = HF_LABEL_TO_FEATURE[det.label.toLowerCase()];
    if (!feature) continue;
    const sev = hfSeverity(det.score);
    const existing = perFeature[feature];
    if (!existing || sev.confidence > existing.confidence) {
      perFeature[feature] = sev;
    }
  }

  // Map back to Face++ per-feature fields. We pick a single face++ field
  // per logical feature (e.g. wrinkle → forehead_wrinkle); pore / pore-
  // sub-zones are unavailable from HF so we leave them zero.
  if (perFeature.acne) raw.acne = { value: perFeature.acne.value, confidence: perFeature.acne.confidence };
  if (perFeature.spot) raw.skin_spot = { value: perFeature.spot.value, confidence: perFeature.spot.confidence };
  if (perFeature.mole) raw.mole = { value: perFeature.mole.value, confidence: perFeature.mole.confidence };
  if (perFeature.wrinkle) raw.forehead_wrinkle = { value: perFeature.wrinkle.value, confidence: perFeature.wrinkle.confidence };

  return raw;
}

/**
 * Public entry point. Mirrors `analyzeSkinWithFacePlus` signature so the
 * orchestrator can swap them in a try/catch chain transparently.
 *
 * Returns an AnalysisVerdict with `data_quality: "partial"` (only
 * acne/spot/mole/wrinkle are populated; everything else stays at
 * zero confidence, which `weightedSkinScore` filters out).
 */
export async function analyzeSkinWithHuggingFace(
  imageBase64: string,
): Promise<AnalysisVerdict> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const sizeKB = Math.round((cleanBase64.length * 3) / 4 / 1024);
  if (sizeKB < 10) {
    throw new Error("Фото слишком маленькое. Сделайте новый снимок.");
  }

  console.log(`[HuggingFace] Calling ${HF_MODEL} (${sizeKB}KB)…`);
  const detections = await callHuggingFace(cleanBase64);
  console.log(`[HuggingFace] Returned ${detections.length} detections`);

  const raw = synthesizeRawFacePlus(detections);

  // ── Build features bag (matches facePlusService contract exactly) ──
  // HF has no pore sub-zones / eyelids pair / wrinkle sub-zones / etc.
  // We pass aggregated acne/spot/mole/wrinkle through; everything else
  // stays at conf=0 → silent in weightedSkinScore.
  const features: Record<string, { value: number; confidence: number }> = {
    acne: { value: raw.acne.value, confidence: raw.acne.confidence },
    dark_circle: { value: 0, confidence: 0 },
    pore: { value: 0, confidence: 0 },       // HF model has no pore detector
    spot: { value: raw.skin_spot.value, confidence: raw.skin_spot.confidence },
    wrinkle: { value: raw.forehead_wrinkle.value, confidence: raw.forehead_wrinkle.confidence },
    blackhead: { value: 0, confidence: 0 },
    eye_pouch: { value: 0, confidence: 0 },
    eyelids: { value: 0, confidence: 0 },
  };

  // Trimmed recommendations menu — HF can only detect acne/spot/wrinkle.
  // Full RECOMMENDATIONS_MAP lives in skinScoring.ts; we deliberately
  // pick a subset here so we don't recommend unrelated products.
  const HF_RECOMMENDATIONS_MAP: Record<string, string[]> = {
    acne: [
      "Сыворотка с салициловой кислотой 2% для проблемной кожи",
      "Лёгкий гель с цинком для успокоения воспалений",
    ],
    spot: [
      "Сыворотка с витамином C для осветления пигментации",
      "SPF 50+ ежедневно для защиты от фотостарения",
    ],
    wrinkle: [
      "Крем с ретинолом для стимуляции коллагена",
      "Увлажняющий крем с коэнзимом Q10",
    ],
  };

  const problems: string[] = [];
  const recommendations: string[] = [];
  // First pass: aggregate problems + recommendations for downstream
  // severity-from-confidence gate.
  for (const [key, { value, confidence }] of Object.entries(features)) {
    if (confidence < MIN_CONFIDENCE) continue;
    const sev = severityFromValue(value);
    if (!sev) continue;
    const name = PROBLEM_MAP[key];
    if (name) problems.push(`${name} (${sev})`);
    const recs = HF_RECOMMENDATIONS_MAP[key];
    if (recs) recommendations.push(...recs);
  }
  // Note: weightedSkinScore renormalizes by totalW, so the score is
  // meaningful even when only some features have data. data_quality
  // banner (set below) is the user-facing signal that not all
  // features were checked.
  const skinScore = weightedSkinScore(features);

  const mood =
    problems.length >= 3 ? "тревожный" : problems.length >= 1 ? "нейтральный" : "позитивный";

  const dailyRoutine =
    `Утром: Очищение → Тонизирование → Увлажнение → SPF 50+\n` +
    `Вечером: Демакияж → Умывание → Тонизирование → Ночной крем`;

  const productLinks = [
    { name: "Мягкая пенка для умывания", reason: "Базовое очищение без пересушивания", effect: "Кожа остаётся чистой и увлажнённой" },
    { name: "Увлажняющий крем с SPF", reason: "Защита и увлажнение в одном флаконе", effect: "Барьер кожи укрепляется день ото дня" },
  ];

  return {
    skin_type: "неопределён",
    problems,
    skin_score: skinScore,
    recommendations,
    daily_routine: dailyRoutine,
    mood,
    product_links: productLinks,
    _rawResponse: raw,
    data_quality: "partial",
  };
}
