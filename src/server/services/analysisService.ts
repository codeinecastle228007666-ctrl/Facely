import { prisma } from "../db";
import { subscriptionService } from "./subscriptionService";
import { ritualService } from "./ritualService";
import { referralService } from "./referralService";
import { compressImage } from "../utils/imageCompression";
import { XP_PER_ANALYSIS, calculateLevel, didLevelUp } from "../utils/levelSystem";
import { pushService } from "./pushService";
import { analyzeSkinWithFacePlus } from "./facePlusService";

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
      throw new Error(access.reason || "No analyses available");
    }

    const compressedPhoto = await compressImage(photoBase64);
    const result = await analyzeSkinWithFacePlus(compressedPhoto);

    const isFree = user.freeAnalyses > 0 && !(
      user.subscription?.status === "active" &&
      user.subscription.endDate &&
      user.subscription.endDate > new Date()
    );

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

      const hasActiveSubscription =
        user.subscription?.status === "active" &&
        user.subscription.endDate &&
        user.subscription.endDate > new Date();

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

    const leveledUp = didLevelUp(oldXp, newXp);
    if (leveledUp) {
      await pushService.sendLevelUp(user.telegramId, leveledUp);
    }

    await referralService.claimReferralBonus(user.id);

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
};
