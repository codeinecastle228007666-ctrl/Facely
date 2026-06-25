/**
 * Groq vision prompt template + interface for refining Face++ skin analysis.
 *
 * The scoring fix in earlier commits (`score-floor`, `MIN_CONFIDENCE`) made
 * Face++ self-consistent, but its categorical granularity (0/60/100) misses
 * nuance — "mild redness after workout" vs "rosacea-prone" look the same
 * to a structured API. A vision model that sees the photo AND has the raw
 * Face++ vitals gives much better problem framing.
 *
 * Pass: (a) the photo, (b) Face++ raw JSON severity map. Groq returns a
 * JSON with the same problem names as PROBLEM_MAP but with humand-tuned
 * severities. We MERGE — Groq wins on severities it touches, Face++
 * remains the base layer (works even if Groq fails or is unconfigured).
 *
 * Model choice: meta-llama/llama-4-scout-17b-16e-instruct (matches the
 * vision models used by inventoryService OCR). Single-pass JSON output,
 * temperature 0.1, 600 token budget.
 */

export interface GroqSkinInterpretation {
  /**
   * Sometimes the structured Face++ skin_type misses context (e.g. a
   * "combination" face after a sweaty workout that the user thinks is
   * "oily"). Groq can override if confidence in their judgment ≥ medium.
   */
  skin_type?: string;
  /**
   * Problems NOT seen by Face++ that the photo shows. Names must match
   * PROBLEM_MAP keys (акне, тёмные круги, поры, пигментация, морщины,
   * чёрные точки, мешки под глазами, отёчность век).
   */
  additional_problems?: Array<{
    name: string;
    severity: "лёгкое" | "умеренное" | "выраженное";
  }>;
  /**
   * Problems where Face++ detected something but Groq wants to refine
   * the severity (e.g. Face++ says "лёгкое", visually it's "умеренное").
   * We trust Groq here.
   */
  severity_overrides?: Array<{
    name: string;
    severity: "лёгкое" | "умеренное" | "выраженное";
  }>;
  /**
   * Quick free-text note from model — useful for debugging & future
   * tuning. Not shown to user directly.
   */
  notes?: string;
}

export const GROQ_SKIN_PROMPT = `Ты дерматолог-косметолог с 15-летним стажем. Тебе дали:
1. Фотографию лица пользователя (анфас, без фильтров).
2. Структурированные измерения кожи от Face++ API (значение 0-100 + уверенность 0-1).

Твоя задача: уточнить список проблем кожи, используя ОБА источника.

Верни ТОЛЬКО JSON без markdown и без пояснений:
{
  "skin_type": "сухая" | "жирная" | "комбинированная" | "нормальная" | null,
  "additional_problems": [
    { "name": "<имя>", "severity": "лёгкое" | "умеренное" | "выраженное" }
  ],
  "severity_overrides": [
    { "name": "<имя>", "severity": "лёгкое" | "умеренное" | "выраженное" }
  ],
  "notes": "<короткое наблюдение>"
}

Правила:
- Имена проблем ТОЛЬКО из этого списка (НЕ придумывай новые): "акне", "тёмные круги", "поры", "пигментация", "морщины", "чёрные точки", "мешки под глазами", "отёчность век".
- additional_problems — это то, что Face++ НЕ увидел (low confidence или 0), но ты видишь на фото.
- severity_overrides — это когда Face++ указал проблему, но ты считаешь что severity другая (например, Face++ говорит "лёгкое", а визуально явно "умеренное").
- Если фото не информативно (плохое освещение, лицо частично скрыто) — верни пустые массивы и null.
- Не выдумывай проблемы. Лучше ничего, чем ложноположительный результат.
- Не повторяй то, что Face++ уже надёжно нашёл с высокой confidence.
- severity должен соответствовать реальной выраженности на фото, а не следовать Face++ слепо.`;
