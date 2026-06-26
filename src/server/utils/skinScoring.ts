/**
 * Shared scoring primitives used by both Face++ (primary) and
 * HuggingFace Inference API (fallback) services.
 *
 * Extracted 2026-06-25 evening after a code-reviewer caught that
 * identical copies of severityFromValue / MIN_CONFIDENCE / FEATURE_WEIGHTS
 * lived in facePlusService.ts and huggingFaceSkinService.ts. If anyone
 * tunes the weights tomorrow, both services need to stay in sync —
 * that's a maintenance trap we want out of the user's hands.
 */

export const MIN_CONFIDENCE = 0.4;

// Bogus-result thresholds for the dual-mode Era (2026-06-25 evening).
// Face++ started returning canned responses (all value=0, conf ~0.1)
// after Free-Plan balance hit $0, without throwing a quota error.
// We treat such a response as "invalid" and silently drop it from
// the variants object so users don't see phantom green-circle scores.
export const BOGUS_MAX_VALUE = 30;          // ≥ 30 → at least one feature claimed severity
export const BOGUS_MAX_CONFIDENCE = 0.5;    // ≥ 0.5 → at least one feature declared "confident"

/**
 * Each Face++ feature has its own severity "value" (0-100; usually
 * 0 / 60 / 100) AND a "confidence" (0-1). The old code averaged values
 * across 8 features blindly, which made one severe problem average
 * out as "excellent". This is the same severity-mapping the Face++
 * service uses internally.
 */
export function severityFromValue(value: number): "лёгкое" | "умеренное" | "выраженное" | null {
  if (value >= 90) return "выраженное";
  if (value >= 60) return "умеренное";
  if (value >= 30) return "лёгкое";
  return null;
}

/**
 * Per-feature weights used for the weighted "skin_score" computation.
 * Sum = 1.00. Tune in ONE place; both providers import from here.
 */
export const FEATURE_WEIGHTS: Record<string, number> = {
  acne: 0.22,
  spot: 0.18,
  wrinkle: 0.18,
  dark_circle: 0.12,
  pore: 0.10,
  blackhead: 0.08,
  eye_pouch: 0.06,
  eyelids: 0.06,
};

/**
 * Compute weighted skin score from a feature bag.
 * Returns 100 if no feature is informative (all conf < MIN_CONFIDENCE).
 * Applies the score-floor to prevent green-circle-while-problem-listed lies.
 */
export function weightedSkinScore(
  features: Record<string, { value: number; confidence: number }>,
  problems: { severity: "лёгкое" | "умеренное" | "выраженное" }[] = [],
): number {
  let totalW = 0;
  let goodnessSum = 0;
  for (const [key, { value, confidence }] of Object.entries(features)) {
    const w = FEATURE_WEIGHTS[key];
    if (!w) continue;
    const b = badness(value, confidence);
    totalW += w;
    goodnessSum += w * (1 - b);
  }
  if (totalW === 0) return 100;

  let score = Math.round((goodnessSum / totalW) * 100);
  const hasSevere = problems.some((p) => p.severity === "выраженное");
  const hasModerate = problems.some((p) => p.severity === "умеренное");
  const hasMild = problems.some((p) => p.severity === "лёгкое");
  if (hasSevere) score = Math.min(score, 49);
  else if (hasModerate) score = Math.min(score, 69);
  else if (hasMild) score = Math.min(score, 84);
  return Math.max(0, Math.min(100, score));
}

function badness(value: number, confidence: number): number {
  if (confidence < MIN_CONFIDENCE) return 0;
  return Math.max(0, Math.min(1, value / 100));
}

/**
 * Detect a "bogus" upstream response: every feature has either zero
 * value OR zero confidence. This is the signature of a provider that
 * claims success (`HTTP 200`) but didn't actually do any analysis.
 *
 * We do NOT trust the `provider: "faceplus"` claim alone — Face++ was
 * observed (2026-06-25) returning valid 200 + near-zero feature values
 * instead of an `INSUFFICIENT_BALANCE` error after Free-Plan exhaustion.
 * Without this check, callers would happily render a fake "Face++ says
 * skin is fine" result to the user.
 *
 * Sensitivity nuance (post-review feedback, 2026-06-25 evening):
 * For a genuinely clear-skinned user on a high-quality photo, Face++
 * legitimately returns low values for every skin problem (because the
 * user just has nothing wrong). Naively labelling those as "bogus"
 * would force a swap to HF — which then produces a less informative
 * result. To avoid this false-positive, we treat a response as bogus
 * only if the weighted-scoring grounds are completely silent:
 *
 *   • maxValue  <  BOGUS_MAX_VALUE       (nobody claimed severity)
 *   • maxConfidence < BOGUS_MAX_CONFIDENCE (nobody declared confident)
 *   • weightedSkinScore has no informed signal (totalW === 0)
 *
 * The third clause is the key: even low-severity acne (value=20,
 * conf=0.35) is enough to mark `acne` as a problem with severity
 * "лёгкое", which contributes weight 0.22 to the score => totalW > 0.
 * Only responses where ALL features fail the MIN_CONFIDENCE gate
 * simultaneously get the bogus label.
 */
export function isBogusResult(
  features: Record<string, { value: number; confidence: number }>,
): boolean {
  let maxValue = 0;
  let maxConfidence = 0;
  let totalW = 0;
  for (const [key, { value, confidence }] of Object.entries(features)) {
    if (value > maxValue) maxValue = value;
    if (confidence > maxConfidence) maxConfidence = confidence;
    if (confidence >= MIN_CONFIDENCE) {
      const w = FEATURE_WEIGHTS[key];
      if (w) totalW += w;
    }
  }
  return (
    maxValue < BOGUS_MAX_VALUE &&
    maxConfidence < BOGUS_MAX_CONFIDENCE &&
    totalW === 0
  );
}

/**
 * Translate a Face++ semantic feature key to a Russian user-facing
 * problem name. Same map drives both providers' `problems` array.
 */
export const PROBLEM_MAP: Record<string, string> = {
  acne: "акне",
  dark_circle: "тёмные круги",
  pore: "поры",
  spot: "пигментация",
  wrinkle: "морщины",
  blackhead: "чёрные точки",
  eye_pouch: "мешки под глазами",
  eyelids: "отёчность век",
};

/**
 * Full recommendations menu — Face++ version. Used for the primary
 * path. HuggingFace service uses a trimmed version because it can
 * only detect a subset of features.
 */
export const RECOMMENDATIONS_MAP: Record<string, string[]> = {
  acne: [
    "Сыворотка с салициловой кислотой 2% для проблемной кожи",
    "Лёгкий гель с цинком для успокоения воспалений",
    "Маска с глиной для глубокого очищения пор",
  ],
  dark_circle: [
    "Крем для кожи вокруг глаз с кофеином",
    "Патчи под глаза с гиалуроновой кислотой",
    "Сыворотка с витамином C для осветления",
  ],
  pore: [
    "Сыворотка с ниацинамидом 5% для сужения пор",
    "Энзимная пудра для мягкого отшелушивания",
    "Тонер с AHA-кислотами для выравнивания текстуры",
  ],
  spot: [
    "Сыворотка с витамином C для осветления пигментации",
    "Крем с ретинолом для обновления кожи",
    "SPF 50+ ежедневно для защиты от фотостарения",
  ],
  wrinkle: [
    "Крем с ретинолом для стимуляции коллагена",
    "Сыворотка с пептидами для упругости кожи",
    "Увлажняющий крем с коэнзимом Q10",
  ],
  blackhead: [
    "Сыворотка с салициловой кислотой 2%",
    "Энзимная пудра для умывания",
    "Маска с глиной 2 раза в неделю",
  ],
  eye_pouch: [
    "Крем для век с кофеином",
    "Патчи с гидрогелем под глаза",
    "Лимфодренажный массаж лица",
  ],
  eyelids: [
    "Лёгкий гель для век с экстрактом огурца",
    "Патчи с зелёным чаем для снятия отёчности",
    "Ограничить солёное на ночь",
  ],
};
