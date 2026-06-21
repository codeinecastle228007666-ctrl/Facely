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

  async getStreak(userId: string) {
    const ritual = await prisma.ritual.findUnique({ where: { userId } });
    return ritual ?? { streak: 0, maxStreak: 0, lastDate: null };
  },

  MILESTONES: [3, 7, 14, 30],

  isMilestone(streak: number): number | null {
    if (this.MILESTONES.includes(streak)) return streak;
    return null;
  },
};
