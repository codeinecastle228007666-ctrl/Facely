import { prisma } from "../db";
import { XP_PER_PURCHASE, calculateLevel } from "../utils/levelSystem";

const SUBSCRIPTION_PRICE = 500;
const SUBSCRIPTION_DAYS = 30;
const STARS_PRICE_PER_ANALYSIS = 50;
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

  async createStarsInvoice(userId: string, quantity: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const totalStars = STARS_PRICE_PER_ANALYSIS * quantity;

    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${quantity} анализ кожи`,
          description: `AI-анализ кожи в Reveli — ${quantity} шт.`,
          payload: `analysis_${quantity}_${user.id}`,
          provider_token: "",
          currency: "XTR",
          prices: [{ label: `${quantity} анализ(ов)`, amount: totalStars }],
        }),
      },
    );

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Ошибка создания счёта");
    }

    return { url: data.result };
  },

  async confirmStarsPayment(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { paidAnalyses: { increment: 1 } },
    });
    return { success: true };
  },

  async createChatStarsInvoice(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "10 вопросов косметологу",
          description: "Пакет из 10 вопросов AI-косметологу в Reveli",
          payload: `chat_10_${user.id}`,
          provider_token: "",
          currency: "XTR",
          prices: [{ label: "10 вопросов", amount: 10 }],
        }),
      },
    );

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || "Ошибка создания счёта");
    }

    return { url: data.result };
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
};
