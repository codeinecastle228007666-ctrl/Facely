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

const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN || "";
const BOT_TOKEN = process.env.BOT_TOKEN || "";

// Цены хранятся централизованно в @/lib/pricing — никаких magic numbers здесь.
const CURRENCY: Currency = PROVIDER_TOKEN ? "RUB" : "XTR";
const PAYMENT_CURRENCY = CURRENCY;

function priceFor(tier: TierId): number {
  return PRICES[CURRENCY][tier];
}

export const subscriptionService = {
  async getStatus(userId: string) {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub) return { active: false, type: null, daysLeft: 0 };

    const now = new Date();
    const active = sub.status === "active" && sub.endDate && sub.endDate > now;

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

  async reportCardTransfer(
    userId: string,
    amount: number,
    tier: "single" | "pack5" | "monthly" = "single",
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const expectedAmount = PRICES.RUB[tier];

    // M6: 1-hour dedup. Same user claiming the same tier twice within an hour
    // → silently return without spamming admin. (Also blocks header-spoofing
    // exploits that flood the admin bot with "/I paid/click/click".)
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const recentClaim = await prisma.cardTransferClaim.findFirst({
      where: {
        userId,
        tier,
        claimedAt: { gte: new Date(Date.now() - ONE_HOUR_MS) },
      },
    });
    if (recentClaim) {
      return { success: true, deduped: true };
    }

    // Record claim BEFORE sending notification so concurrent races dedupe.
    await prisma.cardTransferClaim.create({
      data: { userId, tier, amount },
    });

    if (process.env.FEEDBACK_CHAT_ID && BOT_TOKEN) {
      const amountTag =
        amount === expectedAmount ? "\u2705" : `\u26a0\ufe0f заявлено ${amount}\u20bd, ожидаем ${expectedAmount}\u20bd`;
      const msg =
        `\ud83d\udcb3 Перевод на карту\n` +
        `От: ${user.name || user.telegramId}\n` +
        `Тариф: ${TIER_LABELS[tier]}\n` +
        `Сумма: ${amount} ₽ ${amountTag}\n` +
        `ID: ${user.id}`;
      fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.FEEDBACK_CHAT_ID,
          text: msg,
        }),
      }).catch((e) => console.error(`[card-transfer] notify failed: ${e.message}`));
    }

    return { success: true };
  },
};
