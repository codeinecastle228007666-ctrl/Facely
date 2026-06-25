import { prisma } from "../db";
import { XP_PER_PURCHASE, calculateLevel } from "../utils/levelSystem";

const SUBSCRIPTION_PRICE = 500;
const SUBSCRIPTION_DAYS = 30;

// Продакшн-цены (в копейках для RUB, в ⭐ для Stars).
// Тестовое значение 1⭐ использовалось только во время разработки.
const PRICE_PER_ANALYSIS = process.env.PROVIDER_TOKEN
  ? Number(process.env.PRICE_PER_ANALYSIS_RUB || 9900) // копейки: 9900 = 99 ₽
  : Number(process.env.STARS_PRICE_PER_ANALYSIS || 50); // Stars: 50 ⭐ за 1 анализ
const CHAT_PRICE = process.env.PROVIDER_TOKEN
  ? Number(process.env.CHAT_PRICE_RUB || 4900)
  : Number(process.env.STARS_PRICE_CHAT || 200);
const PAYMENT_CURRENCY = process.env.PROVIDER_TOKEN ? "RUB" : "XTR";
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN || "";
const BOT_TOKEN = process.env.BOT_TOKEN || "";

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
      analysis: PRICE_PER_ANALYSIS,
      chat: CHAT_PRICE,
      currency: PAYMENT_CURRENCY,
      isStars: !PROVIDER_TOKEN,
    };
  },

  async createStarsInvoice(userId: string, quantity: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    // Пакет 5+ анализов получает 35% скидку — синхронизируем с UI-кнопкой в PurchaseModal.
    const bulk = quantity >= 5;
    const amount = Math.round(
      PRICE_PER_ANALYSIS * quantity * (bulk ? 0.65 : 1),
    );
    const isStars = !PROVIDER_TOKEN;

    const body: Record<string, unknown> = {
      title: bulk
        ? `${quantity} анализов кожи (пакет, экономия 35%)`
        : `${quantity} анализ кожи`,
      description: `AI-анализ кожи в Reveli — ${quantity} шт.`,
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
    const body: Record<string, unknown> = {
      title: "10 вопросов косметологу",
      description: "Пакет из 10 вопросов AI-косметологу в Reveli",
      payload: `chat_10_${user.id}`,
      provider_token: PROVIDER_TOKEN,
      currency: PAYMENT_CURRENCY,
      prices: [{ label: "10 вопросов", amount: CHAT_PRICE }],
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

    const TIER_LABELS: Record<typeof tier, string> = {
      single: "1 Анализ кожи",
      pack5: "5 Анализов кожи",
      monthly: "Безлимит на месяц",
    };

    const expectedAmount =
      tier === "single"
        ? Number(process.env.CARD_AMOUNT_SINGLE || 150)
        : tier === "pack5"
        ? Number(process.env.CARD_AMOUNT_PACK5 || 500)
        : Number(process.env.CARD_AMOUNT_MONTHLY || 1200);

    // Отправляем уведомление админу через Telegram Bot API
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
      }).catch(() => {});
    }

    return { success: true };
  },
};
