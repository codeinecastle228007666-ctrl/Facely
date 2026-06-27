import { prisma } from "../db";
import { pushService } from "./pushService";

export const ritualService = {
  async updateStreak(userId: string) {
    const ritual = await prisma.ritual.findUnique({ where: { userId } });

    if (!ritual) {
      console.log(`[ritual] No ritual found for ${userId}, creating with streak=1`);
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

    console.log(`[ritual] userId=${userId}, streak=${ritual.streak}, diffDays=${diffDays}, lastDate=${lastDate.toISOString()}, today=${today.toISOString()}`);

    if (diffDays === 0) {
      if (ritual.streak === 0) {
        console.log(`[ritual] First analysis same day, bumping streak 0→1`);
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

    console.log(`[ritual] Updating streak ${ritual.streak}→${newStreak} (diffDays=${diffDays})`);
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
    return ritual ?? { streak: 0, maxStreak: 0, lastDate: null, weeklyStreak: 0, nextAnalysisDate: null, lastSentMilestone: null };
  },

  MILESTONES: [2, 4, 8, 12, 24],

  isMilestone(streak: number): number | null {
    if (this.MILESTONES.includes(streak)) return streak;
    return null;
  },

  /**
   * 2026-06-27 — Daily sweep that catches users whose streak broke
   * because they missed a day. Runs from /api/remind (cron-job.org pings
   * it daily). pushScheduler.ts owns the same intent but uses node-cron
   * which doesn't survive Vercel's serverless lifetime — /api/remind is
   * the only reliable trigger in production.
   *
   * Per candidate (User with streak > 0 AND Ritual.lastDate < threshold):
   *   - streakFreezes > 0 → consume one freeze, set Ritual.lastDate = now
   *     (so updateStreak won't see "missed day" on next analysis), push
   *     "Streak saved 🧊" notification.
   *   - streakFreezes == 0 → reset Ritual.streak to 0 AND clear
   *     lastSentMilestone (so when streak climbs back, milestones
   *     re-fire cleanly), push "Streak broken 😔" notification.
   *
   * Why 36h threshold (vs 24h): cron-job.org daily is jitter-prone, and
   * lastDate is server-stored UTC while users see local. 36h catches
   * users whose last analysis was anywhere in "yesterday's window"
   * regardless of timezone edges.
   *
   * Idempotent on same-day re-fires: after first run, Ritual.lastDate =
   * now (≈ today), so threshold filter excludes the user on re-run.
   *
   * NOT transactional: best-effort separate updates. Worst-case on
   * process crash mid-loop is "freeze decremented but DB write for
   * lastDate failed" (recoverable on next day's run — user loses one
   * freeze but streak still breaks correctly). Acceptable for MVP.
   */
  async breakMissedStreaks() {
    const now = new Date();
    const threshold = new Date(now.getTime() - 36 * 3600 * 1000);

    // Batch 1: users WITH streakFreezes → consume one, save streak.
    const freezeCandidates = await prisma.user.findMany({
      where: {
        streakFreezes: { gt: 0 },
        rituals: {
          some: {
            lastDate: { lt: threshold },
            streak: { gt: 0 },
          },
        },
      },
      select: {
        id: true,
        telegramId: true,
        streakFreezes: true,
        rituals: { select: { id: true, streak: true }, take: 1 },
      },
    });

    let savedCount = 0;
    for (const user of freezeCandidates) {
      const ritual = user.rituals[0];
      if (!ritual) continue;
      await prisma.user.update({
        where: { id: user.id },
        data: { streakFreezes: { decrement: 1 } },
      });
      await prisma.ritual.update({
        where: { id: ritual.id },
        data: { lastDate: now },
      });
      await pushService.sendStreakFrozen(
        user.telegramId,
        user.streakFreezes - 1,
        ritual.streak,
      );
      savedCount++;
    }

    // Batch 2: users WITHOUT freezes → reset streak + clear milestone sentinel.
    const resetCandidates = await prisma.user.findMany({
      where: {
        streakFreezes: 0,
        rituals: {
          some: {
            lastDate: { lt: threshold },
            streak: { gt: 0 },
          },
        },
      },
      select: {
        id: true,
        telegramId: true,
        rituals: { select: { id: true, streak: true }, take: 1 },
      },
    });

    let brokenCount = 0;
    for (const user of resetCandidates) {
      const ritual = user.rituals[0];
      if (!ritual) continue;
      await prisma.ritual.update({
        where: { id: ritual.id },
        data: { streak: 0, lastSentMilestone: null },
      });
      await pushService.sendStreakBroken(user.telegramId, ritual.streak);
      brokenCount++;
    }

    if (savedCount + brokenCount > 0) {
      console.log(
        `[ritual] breakMissedStreaks: saved=${savedCount} broken=${brokenCount}`,
      );
    }
    return { brokenCount, savedCount };
  },
};
