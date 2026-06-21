import { prisma } from "../db";
import { subscriptionService } from "./subscriptionService";
import { ritualService } from "./ritualService";
import { referralService } from "./referralService";
import { compressImage } from "../utils/imageCompression";
import { XP_PER_ANALYSIS, calculateLevel, didLevelUp } from "../utils/levelSystem";
import { pushService } from "./pushService";
import { analyzeSkinWithFacePlus } from "./facePlusService";
import { achievementService } from "./achievementService";

export const analysisService = {
  async analyze(
    telegramId: string,
    photoBase64: string,
    description?: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { subscription: true },
    });

    if (!user) throw new Error("User not found");

    const access = await subscriptionService.canAccessAnalysis(user.id);
    if (!access.allowed) {
      throw new Error(access.reason || "no_analyses_left");
    }

    const compressedPhoto = await compressImage(photoBase64);
    const result = await analyzeSkinWithFacePlus(compressedPhoto);

    const hasActiveSubscription =
      user.subscription?.status === "active" &&
      user.subscription.endDate &&
      user.subscription.endDate > new Date();

    const isFree = !hasActiveSubscription && user.freeAnalyses > 0;

    await prisma.$transaction(async (tx) => {
      await tx.skinAnalysis.create({
        data: {
          userId: user.id,
          photoBase64: compressedPhoto,
          userDescription: description,
          result: result,
          skinType: result.skin_type,
          isFree,
        },
      });

      if (!hasActiveSubscription) {
        if (user.freeAnalyses > 0) {
          await tx.user.update({
            where: { id: user.id },
            data: { freeAnalyses: { decrement: 1 } },
          });
        } else {
          await tx.user.update({
            where: { id: user.id },
            data: { paidAnalyses: { decrement: 1 } },
          });
        }
      }
    });

    const oldXp = user.xp;
    const newXp = user.xp + XP_PER_ANALYSIS;
    const newLevel = calculateLevel(newXp);

    await prisma.user.update({
      where: { id: user.id },
      data: { xp: newXp, level: newLevel },
    });

    await ritualService.updateStreak(user.id);
    await ritualService.updateWeeklyStreak(user.id);

    const leveledUp = didLevelUp(oldXp, newXp);
    if (leveledUp) {
      await pushService.sendLevelUp(user.telegramId, leveledUp);
    }

    await referralService.claimReferralBonus(user.id);

    await achievementService.checkAndAward(user.id);

    const ritual = await ritualService.getStreak(user.id);
    const milestone = ritualService.isMilestone(ritual.streak);
    if (milestone) {
      await pushService.sendStreakMilestone(user.telegramId, milestone);
    }

    return {
      analysis: result,
      xpGained: XP_PER_ANALYSIS,
      totalXp: newXp,
      level: newLevel,
      streak: ritual.streak,
      maxStreak: ritual.maxStreak,
    };
  },

  async getHistory(telegramId: string, limit = 20, offset = 0) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) throw new Error("User not found");

    const [analyses, total] = await Promise.all([
      prisma.skinAnalysis.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          photoUrl: true,
          skinType: true,
          result: true,
          isFree: true,
          createdAt: true,
        },
      }),
      prisma.skinAnalysis.count({
        where: { userId: user.id },
      }),
    ]);

    return { analyses, total, limit, offset };
  },

  async getComparison(telegramId: string, analysis1Id: string, analysis2Id: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    const [a1, a2] = await Promise.all([
      prisma.skinAnalysis.findFirst({ where: { id: analysis1Id, userId: user.id } }),
      prisma.skinAnalysis.findFirst({ where: { id: analysis2Id, userId: user.id } }),
    ]);

    if (!a1 || !a2) throw new Error("Analysis not found");

    const r1 = a1.result as Record<string, any> | null;
    const r2 = a2.result as Record<string, any> | null;

    const scores1: Record<string, number> = {};
    const scores2: Record<string, number> = {};
    const fields = ["acne", "dark_circle", "pore", "spot", "wrinkle"];

    for (const f of fields) {
      scores1[f] = r1?.[f]?.score ?? (r1?.problems?.includes(f) ? 60 : 0);
      scores2[f] = r2?.[f]?.score ?? (r2?.problems?.includes(f) ? 60 : 0);
    }

    const differences: Record<string, { from: number; to: number; diff: number; improved: boolean }> = {};
    for (const f of fields) {
      const from = scores1[f];
      const to = scores2[f];
      differences[f] = { from, to, diff: to - from, improved: to < from };
    }

    return {
      analysis1: { id: a1.id, date: a1.createdAt, result: r1, skinType: a1.skinType },
      analysis2: { id: a2.id, date: a2.createdAt, result: r2, skinType: a2.skinType },
      differences,
    };
  },
};
