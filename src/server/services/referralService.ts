import { prisma } from "../db";

export const referralService = {
  async claimReferralBonus(userId: string) {
    const referral = await prisma.referral.findUnique({
      where: { refereeId: userId },
    });

    if (!referral || referral.bonusGiven) return false;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: referral.referrerId },
        data: { freeAnalyses: { increment: 2 } },
      }),
      prisma.user.update({
        where: { id: referral.refereeId },
        data: { freeAnalyses: { increment: 1 } },
      }),
      prisma.referral.update({
        where: { id: referral.id },
        data: { bonusGiven: true },
      }),
    ]);

    return true;
  },
};
