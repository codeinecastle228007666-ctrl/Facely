/**
 * Единый источник правды для всех тарифов и цен проекта Reveli.
 *
 * Что здесь лежит: продуктовые цены на 3 тарифа (1 / 5 / месяц) и пакет
 * AI-вопросов в двух валютах. Это НЕ env — это бизнес-параметр, который меняется
 * руками разработчика и коммитится в репозиторий, чтобы:
 *   - история изменений цены была в git blame;
 *   - фронт и сервер ВСЕГДА читали одинаковые числа без разъезда
 *     `process.env.* / NEXT_PUBLIC_*`;
 *   - сделать правку = открыть PR, а не «обновить env на проде».
 *
 * Что остаётся в env:
 *   - `NEXT_PUBLIC_CARD_NUMBER` / `NEXT_PUBLIC_CARD_BANK` — реальный
 *     номер карты СБП/Сбера для ручного перевода и название банка.
 *     Это чувствительные данные → NEXT_PUBLIC гзится в JS-бандл, поэтому
 *     используется ТОЛЬКО как fallback, когда нет PROVIDER_TOKEN.
 *   - `PROVIDER_TOKEN` — токен Smart Global Payment для нативной оплаты
 *     картой прямо в Telegram Mini App (рекомендуемый путь, см. ниже).
 *   - `BOT_TOKEN`, `FEEDBACK_CHAT_ID` — сервисные секреты.
 *
 * Какой режим оплаты активен (определяется автоматически):
 *   1) `PROVIDER_TOKEN` задан        → RUB, нативная карта через Telegram.
 *   2) только `NEXT_PUBLIC_CARD_NUMBER` → ручной перевод на карту.
 *   3) ничего из выше                 → Telegram Stars (XTR, по умолчанию).
 *
 * Политика цен (2026-06):
 *   Себестоимость 1 анализа (Face++ + Groq) ≈ $0.04–0.06.
 *   Telegram Stars: 1⭐ ≈ $0.02.
 *   Маркап ~30× для устойчивой экономики.
 *   Скидка на pack5 = 20% (5 × single = 100%, пакет = 80% от полной суммы).
 *   Monthly = фактически «безлимит» (≈ 30 анализов/мес при средней частоте).
 */

export type Currency = "RUB" | "XTR";

export type TierId = "single" | "pack5" | "monthly";

export interface TierMeta {
  id: TierId;
  icon: string;
  title: string;
  description: string;
  badge?: string;
  /** Сколько анализов засчитывается при покупке (для кредита paidAnalyses). */
  analysisQty: number;
}

// ─── Зафиксированная ценовая сетка ─────────────────────────────────────

export const PRICES: Record<Currency, Record<TierId, number>> = {
  RUB: {
    single: 19900,   // 199 ₽
    pack5: 79900,    // 799 ₽  (полная сумма 5×199 = 995 ₽ → экономия 196 ₽)
    monthly: 199000, // 1990 ₽/мес
  },
  XTR: {
    single: 80,      // ≈ $1.60
    pack5: 320,      // ≈ $6.40 (полная 5×80=400 → экономия 80⭐)
    monthly: 1500,   // ≈ $30/мес
  },
};

export const CHAT_PRICE: Record<Currency, number> = {
  RUB: 9900, // 99 ₽ за пакет из 10 вопросов
  XTR: 400,  // 400 ⭐ за пакет из 10 вопросов
};

export const SUBSCRIPTION_DAYS = 30;

export const TIER_LABELS: Record<TierId, string> = {
  single: "1 Анализ кожи",
  pack5: "5 Анализов кожи",
  monthly: "Безлимит на месяц",
};

export const TIERS_META: readonly TierMeta[] = [
  {
    id: "single",
    icon: "🌱",
    title: "1 Анализ кожи",
    description: "Разовый анализ — тип кожи, проблемы и рекомендации",
    analysisQty: 1,
  },
  {
    id: "pack5",
    icon: "✨",
    title: "5 Анализов кожи",
    description: "Для регулярного отслеживания динамики кожи",
    badge: "ПОПУЛЯРНО",
    analysisQty: 5,
  },
  {
    id: "monthly",
    icon: "👑",
    title: "Безлимит на месяц",
    description: "Все анализы без ограничений + приоритетная поддержка",
    analysisQty: 30,
  },
] as const;

// ─── UI-хелперы ─────────────────────────────────────────────────────────

/** Итоговая строка «199 ₽» или «80 ⭐». */
export function formatAmount(amount: number, currency: Currency): string {
  if (currency === "RUB") {
    const rubles = Math.round(amount / 100);
    return `${rubles.toLocaleString("ru-RU")} ₽`;
  }
  return `${amount} \u2B50`;
}

/** «Экономия 20%» для pack5; null для остальных. */
export function bulkSavingsCopy(tier: TierId): string | null {
  return tier === "pack5" ? "Экономия 20%" : null;
}

/** Цена за единицу для подписи под суммой. */
export function pricePerAnalysis(
  currency: Currency,
  tier: TierId,
): string {
  const total = PRICES[currency][tier];
  if (tier === "monthly") return `${formatAmount(total, currency)} / мес`;
  const meta = TIERS_META.find((t) => t.id === tier)!;
  if (meta.analysisQty <= 1) return formatAmount(total, currency);
  const per = Math.round(total / meta.analysisQty);
  return `${formatAmount(per, currency)} / анализ`;
}
