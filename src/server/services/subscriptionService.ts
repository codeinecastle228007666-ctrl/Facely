import { prisma } from "../db";

const SUBSCRIPTION_PRICE = 500;
const SUBSCRIPTION_DAYS = 30;

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
      return { allowed: false, reason: "no_free_analyses" };
    }

    return { allowed: false, reason: "no_analyses_left" };
  },
};
