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
