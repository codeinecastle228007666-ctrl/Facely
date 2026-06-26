// Exported so huggingFaceSkinService.ts can synthesize a synthetic
// FacePlusResult from YOLO detections (kept in the same shape so the
// downstream severity/score pipeline is identical regardless of which
// provider produced it).
export interface FacePlusItem {
  confidence: number;
  value: number;
}

export interface FacePlusResult {
  acne: FacePlusItem;
  dark_circle: FacePlusItem;
  skin_spot: FacePlusItem;
  pores_left_cheek: FacePlusItem;
  pores_right_cheek: FacePlusItem;
  pores_forehead: FacePlusItem;
  pores_jaw: FacePlusItem;
  nasolabial_fold: FacePlusItem;
  forehead_wrinkle: FacePlusItem;
  glabella_wrinkle: FacePlusItem;
  crows_feet: FacePlusItem;
  eye_finelines: FacePlusItem;
  eye_pouch: FacePlusItem;
  left_eyelids: FacePlusItem;
  right_eyelids: FacePlusItem;
  blackhead: FacePlusItem;
  mole: FacePlusItem;
  skin_type: {
    details: Record<string, FacePlusItem>;
    skin_type: number;
  };
}

export interface FacePlusResponse {
  result: FacePlusResult;
  face_rectangle: { left: number; top: number; width: number; height: number };
  error_message?: string;
  time_used: number;
}

import {
  FEATURE_WEIGHTS,
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

// SKIN_TYPE_MAP, buildRoutine, generateProductLinks now live in
// skinScoring.ts (2026-06-26) as shared helpers between Face++ and
// Gemini providers. Imported at the top of this file.

/**
 * Resolve skin type only when the model is confident.
 */
function determineSkinType(skinType: FacePlusResult["skin_type"] | undefined | null): string {
  const top = skinType?.skin_type ?? 3;
  const conf = skinType?.details?.[String(top)]?.confidence ?? 0;
  const name = SKIN_TYPE_MAP[top] || "нормальная";
  return conf >= MIN_CONFIDENCE ? name : "неопределён";
}

const PROBLEM_DESC: Record<string, string> = {
  acne: "Воспалительные элементы на коже: чёрные точки, папулы, пустулы. Могут быть вызваны гормональными изменениями, неправильным уходом или питанием.",
  dark_circle: "Потемнение кожи под глазами. Причины: нарушение микроциркуляции, недостаток сна, генетическая предрасположенность, истончение кожи.",
  pore: "Расширенные поры — результат избыточной выработки себума и снижения упругости стенок пор. Чаще встречаются в Т-зоне.",
  spot: "Участки гиперпигментации: постакне, солнечные пятна, мелазма. Возникают из-за избыточной выработки меланина под воздействием УФ.",
  wrinkle: "Мимические и возрастные морщины. Появляются из-за снижения выработки коллагена и эластина, обезвоженности, воздействия УФ.",
  blackhead: "Открытые комедоны — результат закупорки пор кожным салом и ороговевшими клетками. Чаще встречаются в Т-зоне.",
  eye_pouch: "Припухлость под глазами: задержка жидкости, усталость, возрастные изменения, нарушение лимфотока.",
  eyelids: "Отёчность век — скопление жидкости в тканях вокруг глаз. Причины: усталость, недосып, задержка соли.",
};

// buildRoutine + generateProductLinks now imported from
// ../utils/skinScoring.ts (shared with Gemini provider; centralization
// also fixes a latent bug: Face++'s old local copies used
// `.includes("морщины")` which never matched `"морщины (умеренное)"`,
// silently dropping сыворотка/ретинол recommendations. Centralized
// version uses `.startsWith()` matching problem prefixes.)

function determineMood(
  problems: string[],
): "позитивный" | "нейтральный" | "тревожный" {
  if (problems.length >= 3) return "тревожный";
  if (problems.length >= 1) return "нейтральный";
  return "позитивный";
}

export type AnalysisVerdict = {
  skin_type: string;
  problems: string[];
  skin_score: number;
  recommendations: string[];
  daily_routine: string;
  mood: "позитивный" | "нейтральный" | "тревожный";
  product_links: Array<{
    name: string;
    reason: string;
    effect: string;
  }>;
  /**
   * Internal: full Face++ response passed back to the service layer so
   * it can persist into SkinAnalysis.rawFacePlus. Stripped before
   * sending to the client.
   *
   * History: Jun-25 rolled Groq severity refinement back (JSON parse
   * failures); Jun-25 evening rolled Groq `analyzeProblemPositions`
   * back too — vision LLM was misclassifying nostrils / eyebrows / lips
   * as inflammatory lesions. We rely solely on Face++ structured data
   * with confidence gating for objectivity.
   *
   * Jun-25 evening: added HuggingFace fallback (data_quality="partial"
   * when this provider kicks in). Set here too so Face++ writes
   * "full" and HF writes "partial" naturally.
   */
  _rawResponse: FacePlusResult;
  /**
   * Jun-25: which AI provider produced this verdict. Set explicitly by
   * huggingFaceSkinService to "partial" (only acne/spot/mole/wrinkle)
   * and stays undefined (or "full") for Face++ records. ResultModal
   * surfaces this as a degraded-mode banner.
   *
   * Jun-25 evening (dual-mode era): also exposes "invalid" — set when
   * the provider returned HTTP 200 but the feature bag was all-zero
   * (no real analysis). The orchestrator silently drops these from
   * the user-visible `variants` map. They are still persisted to the
   * `rawFacePlus` / `rawHuggingFace` JSON column for debug, but never
   * rendered.
   */
  data_quality?: "full" | "partial" | "invalid";
};

/**
 * Thrown by `analyzeSkinWithFacePlus` when the upstream API explicitly
 * tells us the account is out of credits or rate-limited. Caught by
 * `analysisService.analyze` to swap to the HuggingFace provider.
 *
 * We can't use a string check (too brittle across i18n / Face++ changes),
 * so we throw a dedicated Error subclass.
 */
export class AppQuotaExceededError extends Error {
  constructor(message = "Face++ quota exceeded") {
    super(message);
    this.name = "AppQuotaExceededError";
  }
}

export async function analyzeSkinWithFacePlus(
  imageBase64: string,
): Promise<AnalysisVerdict> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const sizeKB = Math.round((cleanBase64.length * 3) / 4 / 1024);
  if (sizeKB < 10) {
    throw new Error("Фото слишком маленькое. Сделайте новый снимок.");
  }

  const buffer = Buffer.from(cleanBase64, "base64");
  const formData = new FormData();
  formData.append("api_key", process.env.FACE_PLUS_KEY!);
  formData.append("api_secret", process.env.FACE_PLUS_SECRET!);
  formData.append("image_file", new Blob([buffer], { type: "image/jpeg" }), "photo.jpg");
  formData.append("return_attributes", "skin_status,skin_health");

  let response: Response;
  try {
    response = await fetch(
      "https://api-us.faceplusplus.com/facepp/v1/skinanalyze",
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(20000),
      },
    );
  } catch (e: any) {
    console.error(`[Face++] Network error: ${e.message}`);
    throw new Error("Не удалось подключиться к серверу анализа. Проверьте интернет и попробуйте снова.");
  }

  const raw = await response.text();
  let data: FacePlusResponse;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`[Face++] Raw response: ${raw.slice(0, 1000)}`);
    throw new Error("Некорректный ответ от Face++ API");
  }

  console.log(`[Face++] Full response:`, JSON.stringify(data));

  if (data.error_message) {
    console.log(`[Face++] API error: ${data.error_message}`);
    const knownErrors: Record<string, string> = {
      "FACE_NO_FACE": "Не видно лица. Сфотографируйтесь анфас при хорошем освещении, без макияжа, уберите волосы с лица.",
      "FACE_MULTIPLE_FACES": "На фото несколько лиц. Сделайте снимок только своего лица.",
      "FACE_OCCLUDED": "Лицо частично закрыто. Уберите волосы, руки, маску — лицо должно быть полностью видно.",
      "INVALID_IMAGE_SIZE": "Фото слишком большого размера. Сделайте новый снимок.",
      "INVALID_IMAGE_FORMAT": "Формат фото не поддерживается. Используйте JPEG или PNG.",
      "IMAGE_SIZE_TOO_SMALL": "Фото слишком маленькое. Сделайте снимок крупнее, лицо должно занимать большую часть кадра.",
    };
    // Quota / auth errors → orchestrator should swap to HuggingFace
    // fallback. We use a dedicated Error subclass so the check is
    // structural (instanceof) rather than fragile string-match.
    const QUOTA_ERROR_CODES = new Set([
      "INSUFFICIENT_BALANCE",
      "CONCURRENCY_LIMIT_EXCEEDED",
      "OUT_OF_QUOTA",
      "AUTHORIZATION_ERROR",
    ]);
    if (QUOTA_ERROR_CODES.has(data.error_message)) {
      throw new AppQuotaExceededError(
        `Face++ quota exhausted (${data.error_message}). Falling back to HuggingFace.`,
      );
    }
    const userMessage = knownErrors[data.error_message] || `Не удалось проанализировать фото. Пожалуйста, сделайте новый снимок с хорошим освещением.\n(Код ошибки: ${data.error_message})`;
    throw new Error(userMessage);
  }

  if (!data.result) {
    throw new Error("Face++ не смог проанализировать кожу. Попробуйте другое фото.");
  }

  const r = data.result;

  // Aggregate pore score (max-confidence across 4 zones — see commit
  // "pore max-conf" for rationale).
  const poreEntries = [
    r.pores_left_cheek,
    r.pores_right_cheek,
    r.pores_forehead,
    r.pores_jaw,
  ].map((v) => v ?? { confidence: 0, value: 0 });
  const bestPore = poreEntries.reduce((best, cur) =>
    cur.confidence > best.confidence ? cur : best,
  );
  const poreConfidence = bestPore.confidence;
  const poreValue = bestPore.value;

  // Aggregate wrinkle as max across types.
  const wrinkleValues = [
    r.nasolabial_fold,
    r.forehead_wrinkle,
    r.glabella_wrinkle,
    r.crows_feet,
    r.eye_finelines,
  ].map((v) => v ?? { confidence: 0, value: 0 });
  const wrinkleEntry = wrinkleValues.reduce((worst, cur) =>
    cur.value > worst.value ? cur : worst,
  );

  // Aggregate eyelids as average across both eyes.
  const eyelidConfidence =
    ((r.left_eyelids?.confidence ?? 0) + (r.right_eyelids?.confidence ?? 0)) / 2;
  const eyelidValue =
    ((r.left_eyelids?.value ?? 0) + (r.right_eyelids?.value ?? 0)) / 2;

  // Build feature bag for weighted scoring.
  const features: Record<string, { value: number; confidence: number }> = {
    acne: { value: r.acne?.value ?? 0, confidence: r.acne?.confidence ?? 0 },
    dark_circle: { value: r.dark_circle?.value ?? 0, confidence: r.dark_circle?.confidence ?? 0 },
    pore: { value: poreValue, confidence: poreConfidence },
    spot: { value: r.skin_spot?.value ?? 0, confidence: r.skin_spot?.confidence ?? 0 },
    wrinkle: { value: wrinkleEntry.value, confidence: wrinkleEntry.confidence },
    blackhead: { value: r.blackhead?.value ?? 0, confidence: r.blackhead?.confidence ?? 0 },
    eye_pouch: { value: r.eye_pouch?.value ?? 0, confidence: r.eye_pouch?.confidence ?? 0 },
    eyelids: { value: eyelidValue, confidence: eyelidConfidence },
  };

  // Bogus detection: Face++ was observed (2026-06-25) returning canned
  // near-zero responses instead of throwing a quota error after Free-Plan
  // exhaustion. Mark such a verdict as `data_quality: "invalid"` so the
  // orchestrator's dual-mode logic drops it from the user-facing variants.
  const bogo = isBogusResult(features);

  // Build problem list from Face++.
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

  const skinType = determineSkinType(r.skin_type);
  const skinScore = weightedSkinScore(features, problemEntries);
  const problems = problemEntries.map((p) => `${p.name} (${p.severity})`);

  const hasAcne = problemEntries.some((p) => p.name === "акне");

  const mood = determineMood(problems);
  const dailyRoutine = buildRoutine(skinType, problems, hasAcne);
  const productLinks = generateProductLinks(problems);

  return {
    skin_type: skinType,
    problems,
    skin_score: skinScore,
    recommendations,
    daily_routine: dailyRoutine,
    mood,
    product_links: productLinks,
    _rawResponse: r,
    data_quality: bogo ? "invalid" : "full",
  };
}
