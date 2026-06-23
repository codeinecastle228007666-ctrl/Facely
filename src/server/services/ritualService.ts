import { prisma } from "../db";

export const ritualService = {
  async updateStreak(userId: string) {
    const ritual = await prisma.ritual.findUnique({ where: { userId } });

    if (!ritual) {
      return prisma.ritual.create({
        data: { userId, streak: 1, maxStreak: 1, lastDate: new Date() },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDate = new Date(ritual.lastDate);
    lastDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (today.getTime() - lastDate.getTime()) / 86400000,
    );

    if (diffDays === 0) {
      if (ritual.streak === 0) {
        const updated = await prisma.ritual.update({
          where: { userId },
          data: { streak: 1, maxStreak: 1, lastDate: new Date() },
        });
        return updated;
      }
      return ritual;
    }

    let newStreak: number;
    if (diffDays === 1) {
      newStreak = ritual.streak + 1;
    } else {
      newStreak = 1;
    }

    const newMaxStreak = Math.max(ritual.maxStreak, newStreak);

    return prisma.ritual.update({
      where: { userId },
      data: {
        streak: newStreak,
        maxStreak: newMaxStreak,
        lastDate: new Date(),
      },
    });
  },

  async updateWeeklyStreak(userId: string) {
    const lastAnalysis = await prisma.skinAnalysis.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const now = new Date();
    const ritual = await prisma.ritual.findUnique({ where: { userId } });

    if (!lastAnalysis) {
      if (!ritual) {
        return prisma.ritual.create({
          data: {
            userId,
            weeklyStreak: 1,
            streak: 0,
            maxStreak: 0,
            lastDate: now,
            nextAnalysisDate: new Date(now.getTime() + 7 * 86400000),
          },
        });
      }
      return ritual;
    }

    const diffDays = Math.floor(
      (now.getTime() - lastAnalysis.createdAt.getTime()) / 86400000,
    );

    let newWeeklyStreak: number;
    if (diffDays <= 7) {
      newWeeklyStreak = (ritual?.weeklyStreak || 0) + 1;
    } else if (diffDays <= 10) {
      newWeeklyStreak = ritual?.weeklyStreak || 1;
    } else {
      newWeeklyStreak = 1;
    }

    const nextDate = new Date(now.getTime() + 7 * 86400000);

    if (!ritual) {
      return prisma.ritual.create({
        data: {
          userId,
          weeklyStreak: newWeeklyStreak,
          streak: 0,
          maxStreak: 0,
          lastDate: now,
          nextAnalysisDate: nextDate,
        },
      });
    }

    return prisma.ritual.update({
      where: { userId },
      data: {
        weeklyStreak: newWeeklyStreak,
        nextAnalysisDate: nextDate,
        lastDate: now,
      },
    });
  },

  async getWeeklyStreak(userId: string) {
    const ritual = await prisma.ritual.findUnique({ where: { userId } });
    if (!ritual || !ritual.nextAnalysisDate) {
      return { weeklyStreak: 0, nextAnalysisDate: null, daysUntilNext: 0, canAnalyze: true };
    }

    const now = new Date();
    const diffMs = ritual.nextAnalysisDate.getTime() - now.getTime();
    const daysUntilNext = Math.max(0, Math.ceil(diffMs / 86400000));
    const canAnalyze = diffMs <= 0;

    return {
      weeklyStreak: ritual.weeklyStreak,
      nextAnalysisDate: ritual.nextAnalysisDate,
      daysUntilNext,
      canAnalyze,
    };
  },

  async getStreak(userId: string) {
    const ritual = await prisma.ritual.findUnique({ where: { userId } });
    return ritual ?? { streak: 0, maxStreak: 0, lastDate: null, weeklyStreak: 0, nextAnalysisDate: null };
  },

  MILESTONES: [2, 4, 8, 12, 24],

  isMilestone(streak: number): number | null {
    if (this.MILESTONES.includes(streak)) return streak;
    return null;
  },
};
