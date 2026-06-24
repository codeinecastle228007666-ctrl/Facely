import { prisma } from "../db";
import { XP_PER_REFERRAL, calculateLevel } from "../utils/levelSystem";

export const referralService = {
  async claimReferralBonus(userId: string) {
    const referral = await prisma.referral.findUnique({
      where: { refereeId: userId },
    });

    if (!referral || referral.bonusGiven) return false;

    const referrer = await prisma.user.findUnique({
      where: { id: referral.referrerId },
    });
    const referee = await prisma.user.findUnique({
      where: { id: referral.refereeId },
    });
    if (!referrer || !referee) return false;

    const referrerNewXp = referrer.xp + XP_PER_REFERRAL;
    const refereeNewXp = referee.xp + Math.floor(XP_PER_REFERRAL / 2);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: referral.referrerId },
        data: {
          freeAnalyses: { increment: 2 },
          xp: referrerNewXp,
          level: calculateLevel(referrerNewXp),
          referralCount: { increment: 1 },
        },
      }),
      prisma.user.update({
        where: { id: referral.refereeId },
        data: {
          freeAnalyses: { increment: 1 },
          xp: refereeNewXp,
          level: calculateLevel(refereeNewXp),
        },
      }),
      prisma.referral.update({
        where: { id: referral.id },
        data: { bonusGiven: true },
      }),
    ]);

    return true;
  },

  async getReferralStats(telegramId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) throw new Error("User not found");

    const count = user.referralCount;
    const bonusEarned = count * 2;

    const allUsers = await prisma.user.findMany({
      where: { referralCount: { gt: 0 } },
      orderBy: { referralCount: "desc" },
      select: { id: true, referralCount: true },
    });

    let leaderboardPosition: number | null = null;
    const pos = allUsers.findIndex((u) => u.id === user.id);
    if (pos >= 0) leaderboardPosition = pos + 1;

    const referrals = await prisma.referral.findMany({
      where: { referrerId: user.id },
      include: {
        referee: { select: { name: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const referredUsers = referrals.map((r) => ({
      name: r.referee.name || "Пользователь",
      joinedAt: r.createdAt.toISOString(),
      bonusGiven: r.bonusGiven,
    }));

    return { count, bonusEarned, leaderboardPosition, referredUsers };
  },
};
