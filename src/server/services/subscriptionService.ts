import { prisma } from "../db";
import { XP_PER_PURCHASE, calculateLevel } from "../utils/levelSystem";
import {
  PRICES,
  CHAT_PRICE,
  SUBSCRIPTION_DAYS,
  TIER_LABELS,
  type Currency,
  type TierId,
} from "@/lib/pricing";
import { randomBytes } from "node:crypto";

/**
 * Card-transfer tier union. Includes "fifteen" (proposed in 2026-06-26
 * tier plan) so the schema flag `tier` doesn't reject future tiers.
 * Pricing entry for "fifteen" lives in `lib/pricing.ts` once it's added.
 */
export type CardTierId = "single" | "pack5" | "monthly" | "fifteen";

const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN || "";
const BOT_TOKEN = process.env.BOT_TOKEN || "";

// Цены хранятся централизованно в @/lib/pricing — никаких magic numbers здесь.
const CURRENCY: Currency = PROVIDER_TOKEN ? "RUB" : "XTR";
const PAYMENT_CURRENCY = CURRENCY;

function priceFor(tier: TierId): number {
  return PRICES[CURRENCY][tier];
}

/**
 * Card-transfer pricing: always RUB regardless of UI currency
 * (Telegram Stars users see the "Картой" fallback when PROVIDER_TOKEN
 * isn't set; the underlying price is always the RUB tier price).
 */
function priceForCard(tier: CardTierId): number {
  // PRICES.RUB might not have an entry for every CardTierId (e.g. "fifteen"
  // before it's added to pricing.ts). Fall through gracefully rather than
  // blowing up — admin can still see the user's reported amount and try to
  // match.
  return PRICES.RUB[tier as TierId] ?? 0;
}

export const subscriptionService = {
  async getStatus(userId: string) {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub) return { active: false, type: null, daysLeft: 0 };

    const now = new Date();
    const active = sub.status === "active" && sub.endDate && sub.endDate > new Date();

    return {
      active,
      type: sub.type,
      endDate: sub.endDate,
      daysLeft: sub.endDate
        ? Math.max(0, Math.ceil((sub.endDate.getTime() - now.getTime()) / 86400000))
        : 0,
    };
  },

  async activate(userId: string, type: "trial" | "paid" = "paid") {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + SUBSCRIPTION_DAYS);

    return prisma.subscription.upsert({
      where: { userId },
      update: {
        status: "active",
        type,
        endDate,
        startDate: new Date(),
      },
      create: {
        userId,
        status: "active",
        type,
        endDate,
      },
    });
  },

  async deactivate(userId: string) {
    return prisma.subscription.update({
      where: { userId },
      data: { status: "inactive" },
    });
  },

  async canAccessAnalysis(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) return { allowed: false, reason: "User not found" };

    if (user.subscription?.status === "active" && user.subscription.endDate && user.subscription.endDate > new Date()) {
      return { allowed: true };
    }

    if (user.freeAnalyses > 0) {
      return { allowed: true };
    }

    if (user.paidAnalyses > 0) {
      return { allowed: true };
    }

    return { allowed: false, reason: "no_analyses_left" };
  },

  async purchaseAnalysis(userId: string, quantity: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const xpGain = XP_PER_PURCHASE * quantity;
    const newXp = user.xp + xpGain;
    const newLevel = calculateLevel(newXp);

    await prisma.user.update({
      where: { id: userId },
      data: {
        paidAnalyses: { increment: quantity },
        xp: newXp,
        level: newLevel,
      },
    });

    return { quantity, xpGained: xpGain, totalXp: newXp, level: newLevel };
  },

  getPrices() {
    return {
      currency: PAYMENT_CURRENCY,
      isStars: !PROVIDER_TOKEN,
      analysis: priceFor("single"),
      pack5: priceFor("pack5"),
      monthly: priceFor("monthly"),
      chat: CHAT_PRICE[CURRENCY],
    };
  },

  async createStarsInvoice(userId: string, quantity: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    // Для покупки одиночного пакета используем тариф-сетку из pricing.ts.
    // quantity=1  → PRICES[currency].single
    // quantity=5  → PRICES[currency].pack5
    // quantity≥5 иной — fallback на 20% скидку от полной суммы.
    const tier: TierId | null =
      quantity === 1 ? "single" : quantity === 5 ? "pack5" : null;
    const amount = tier ? priceFor(tier) : Math.round(priceFor("single") * quantity * 0.8);
    const isStars = !PROVIDER_TOKEN;

    const body: Record<string, unknown> = {
      title: tier
        ? TIER_LABELS[tier]
        : `${quantity} анализов кожи`,
      description: isStars
        ? `AI-анализ кожи в Reveli — ${quantity} шт.`
        : `Оплата картой в Telegram для ${quantity} анализов`,
      payload: `analysis_${quantity}_${user.id}`,
      provider_token: PROVIDER_TOKEN,
      currency: PAYMENT_CURRENCY,
      prices: [{ label: `${quantity} анализ(ов)`, amount }],
    };
    if (isStars) {
      body.start_parameter = "analysis";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeout));

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Ошибка создания счёта");
    }

    return { url: data.result, currency: PAYMENT_CURRENCY, amount };
  },

  async confirmStarsPayment(userId: string, quantity = 1) {
    await prisma.user.update({
      where: { id: userId },
      data: { paidAnalyses: { increment: quantity } },
    });
    return { success: true };
  },

  async createChatStarsInvoice(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isStars = !PROVIDER_TOKEN;
    const amount = CHAT_PRICE[CURRENCY];
    const body: Record<string, unknown> = {
      title: "10 вопросов косметологу",
      description: "Пакет из 10 вопросов AI-косметологу в Reveli",
      payload: `chat_10_${user.id}`,
      provider_token: PROVIDER_TOKEN,
      currency: PAYMENT_CURRENCY,
      prices: [{ label: "10 вопросов", amount }],
    };
    if (isStars) {
      body.start_parameter = "chat";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeout));

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Ошибка создания счёта");
    }

    return { url: data.result, currency: PAYMENT_CURRENCY, amount: CHAT_PRICE };
  },

  async purchaseSubscription(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const sub = await this.activate(userId, "paid");

    const xpGain = XP_PER_PURCHASE * 2;
    const newXp = user.xp + xpGain;
    const newLevel = calculateLevel(newXp);

    await prisma.user.update({
      where: { id: userId },
      data: { xp: newXp, level: newLevel },
    });

    return { subscription: sub, xpGained: xpGain, totalXp: newXp, level: newLevel };
  },

  /**
   * 2026-06-26 Phase 1.5 — internal helper for both `previewCardTransfer`
   * and `reportCardTransfer`. Format: `R-{userLast4UidInUppercase}-{random4Hex}`.
   * User-last4 stays stable for the same user (admin grep / cross-check), the
   * random suffix differs per click, so re-clicks don't collide.
   *
   * Note: this is a pure-string helper with no collision probing — callers
   * do their own P2002 retry via `createCardTransferClaimWithRetry`.
   */
  generateCardTransferRef(user: { id: string }): string {
    const userLast4 = user.id.slice(-4).toUpperCase();
    const random4 = randomBytes(2).toString("hex").toUpperCase();
    return `R-${userLast4}-${random4}`;
  },

  /**
   * 2026-06-26 Phase 1.5 — create-or-retry-then-rethrow wrapper. Two
   * retries on P2002 (UNIQUE collision). 65k combinations per attempt;
   * two collisions in a row is ≈1-in-4-billion. If still colliding on
   * the third attempt, surface the error to the caller — silent data
   * loss would be worse than a transient failure here.
   */
  async createCardTransferClaimWithRetry(data: {
    userId: string;
    tier: CardTierId;
    amount: number;
    submittedReference: string | null;
    screenshotBase64: string | null;
    /**
     * Pass `new Date()` to mark the row as "already submitted → admin was
     * notified" (used by the defensive fork of `reportCardTransfer` when
     * there's no draft to transition). Leave null/undefined for "draft
     * from preview" — `null` becomes `notificationSentAt IS NULL` in DB.
     */
    notificationSentAt?: Date | null;
  }): Promise<{
    id: string;
    userId: string;
    tier: string;
    amount: number;
    expectedReference: string;
    submittedReference: string | null;
    screenshotBase64: string | null;
    claimedAt: Date;
    notificationSentAt: Date | null;
  }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = this.generateCardTransferRef({ id: data.userId });
      try {
        return await prisma.cardTransferClaim.create({
          data: {
            userId: data.userId,
            tier: data.tier,
            amount: data.amount,
            expectedReference: ref,
            submittedReference: data.submittedReference,
            screenshotBase64: data.screenshotBase64,
            // Phase 1.5 regression fix: explicit param. Previously this
            // was hardcoded `undefined`, which silently wrote `null` even
            // in the defensive-fork path → on next re-submit `me` /
            // `reportCardTransfer` would treat the row as a draft and
            // notify admin AGAIN.
            notificationSentAt: data.notificationSentAt ?? null,
          },
        });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
        // Loop: fresh random4 suffix until success or 3 attempts exhausted.
      }
    }
    throw Object.assign(new Error("reference_collision"), { code: "P2002" });
  },

  /**
   * 2026-06-26 Phase 1.5 — runs the actual Telegram admin notification
   * with all available context. Idempotent-by-caller: this method does
   * NOT itself track whether it has been called; the caller must check
   * `notificationSentAt` first to avoid double-notifies.
   */
  async notifyCardTransferAdmin(
    claim: {
      id: string;
      userId: string;
      tier: string;
      amount: number;
      expectedReference: string;
      submittedReference: string | null;
      screenshotBase64: string | null;
      claimedAt: Date;
    },
    expectedAmount: number,
    user: {
      id: string;
      name: string | null;
      telegramId: string;
      username: string | null;
    },
  ): Promise<void> {
    if (!process.env.FEEDBACK_CHAT_ID || !BOT_TOKEN) return;

    const amountTag =
      claim.amount === expectedAmount
        ? "✅"
        : `⚠️ заявлено ${claim.amount}₽, ожидаем ${expectedAmount}₽`;
    const submittedTag = claim.submittedReference
      ? `\n📋 Введённый реф: ${claim.submittedReference}`
      : "";
    const hasScreenshot = !!claim.screenshotBase64;
    const screenshotSizeKb = hasScreenshot
      ? Math.round((claim.screenshotBase64!.length * 0.75) / 1024)
      : 0;
    const screenshotTag = hasScreenshot
      ? `\n📸 Скриншот (${screenshotSizeKb} KB) — откройте Prisma Studio → CardTransferClaim.id=${claim.id}`
      : "";
    const usernameTag = user.username
      ? `\n📱 Telegram: @${user.username} (id ${user.telegramId})`
      : `\n📱 Telegram id: ${user.telegramId}`;

    const msg =
      `💳 Перевод на карту\n` +
      `От: ${user.name || user.telegramId}${usernameTag}\n` +
      `Тариф: ${TIER_LABELS[claim.tier as TierId] ?? claim.tier}\n` +
      `Сумма: ${claim.amount} ₽ ${amountTag}\n` +
      `🔖 Ожидаемый реф: ${claim.expectedReference}${submittedTag}\n` +
      `ID: ${user.id}${screenshotTag}\n\n` +
      `Для подтверждения: npx tsx scripts/credit-by-ref.ts ${claim.expectedReference}`;
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.FEEDBACK_CHAT_ID,
        text: msg,
      }),
    }).catch((e) => console.error(`[card-transfer] notify failed: ${e.message}`));
  },

  /**
   * 2026-06-26 Phase 1.5 — called by PurchaseModal when user clicks
   * "Картой" on a tier card. Returns a unique short ref the user can
   * put in their bank transfer comment, OR finds an existing draft
   * claim so re-opening the modal during one payment attempt returns
   * the same ref (idempotent per (userId, tier)).
   *
   * Lookup policy: most recent claim for (userId, tier) where:
   *   - creditConfirmed = false (admin hasn't credited yet)
   *   - notificationSentAt IS NULL (admin hasn't even been notified)
   * If a draft matches → return its ref unchanged. Otherwise generate
   * a fresh ref + insert a new draft row (notificationSentAt=null).
   */
  async previewCardTransfer(
    userId: string,
    tier: CardTierId,
  ): Promise<{
    success: true;
    expectedReference: string;
    amount: number;
    tier: string;
  }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const draft = await prisma.cardTransferClaim.findFirst({
      where: {
        userId,
        tier,
        creditConfirmed: false,
        notificationSentAt: null,
      },
      orderBy: { claimedAt: "desc" },
    });
    if (draft) {
      return {
        success: true,
        expectedReference: draft.expectedReference,
        amount: draft.amount,
        tier: draft.tier,
      };
    }

    // No draft for this (user, tier) → create one. P2002 retries are
    // handled by createCardTransferClaimWithRetry.
    const created = await this.createCardTransferClaimWithRetry({
      userId,
      tier,
      amount: priceForCard(tier),
      submittedReference: null,
      screenshotBase64: null,
    });

    return {
      success: true,
      expectedReference: created.expectedReference,
      amount: created.amount,
      tier: created.tier,
    };
  },

  /**
   * 2026-06-26 Phase 1.5 — caller-facing. Looks up an existing draft
   * by (userId, expectedReference), patches submittedReference +
   * screenshotBase64, sets `notificationSentAt=now` (only if it was
   * null — idempotent on double-click), and sends admin notification
   * only on the transition null→set.
   *
   * If `expectedReference` is not found (defensive case: user clicked
   * Submit without going through preview, or ref was lost across
   * sessions), fall back to creating a fresh claim with a new ref so
   * the user's flow still completes — admin will see it as a new
   * notification just the same.
   */
  async reportCardTransfer(
    userId: string,
    tier: CardTierId,
    options: {
      expectedReference?: string;
      submittedReference?: string;
      screenshotBase64?: string;
    } = {},
  ): Promise<{ success: true; expectedReference: string } | { success: false; error: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const amount = priceForCard(tier);

    // Use the draft lookup if expectedReference is provided AND it
    // matches a row owned by this user. Falls back to creation only if
    // the draft has already been credited (race) or ref is unknown
    // (defensive against lost preview state).
    let claim =
      options.expectedReference
        ? await prisma.cardTransferClaim.findFirst({
            where: {
              expectedReference: options.expectedReference,
              userId,
            },
          })
        : null;

    if (!claim) {
      // Either: no preview was issued (legacy path / defensive), OR the
      // expected ref is stale (already credited). Create fresh.
      try {
        claim = await this.createCardTransferClaimWithRetry({
          userId,
          tier,
          amount,
          submittedReference: options.submittedReference ?? null,
          screenshotBase64: options.screenshotBase64 ?? null,
          // Stamp "submitted" so the next re-submit on this row treats it
          // as already-notified (idempotent instead of double-pinging
          // admin). The `update`-branch below in this method handles
          // the draft-transition case; this covers the fresh-create
          // defensive fallback.
          notificationSentAt: new Date(),
        });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
        // Extremely unlikely two-collision retry exhausted — surface.
        return { success: false, error: "reference_collision" };
      }
      // Notify admin (new claim → transitioned from "no row" to "row").
      await this.notifyCardTransferAdmin(claim, amount, user);
      return { success: true, expectedReference: claim.expectedReference };
    }

    // Existing draft. Update fields + decide if notification is fresh.
    const wasNotified = claim.notificationSentAt != null;

    if (!wasNotified) {
      // First submit after preview → notify admin and stamp the flag.
      const updated = await prisma.cardTransferClaim.update({
        where: { id: claim.id },
        data: {
          submittedReference: options.submittedReference ?? null,
          screenshotBase64: options.screenshotBase64 ?? null,
          notificationSentAt: new Date(),
        },
      });
      await this.notifyCardTransferAdmin(updated, amount, user);
      return { success: true, expectedReference: updated.expectedReference };
    }

    // Already notified — idempotent. Optionally update submittedReference
    // / screenshotBase64 if user uploaded something late.
    const updated = await prisma.cardTransferClaim.update({
      where: { id: claim.id },
      data: {
        submittedReference: options.submittedReference ?? claim.submittedReference ?? null,
        screenshotBase64: options.screenshotBase64 ?? claim.screenshotBase64 ?? null,
      },
    });
    return { success: true, expectedReference: updated.expectedReference };
  },
};
