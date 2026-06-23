import { prisma } from "../db";
import { calculateLevel } from "../utils/levelSystem";

async function ensureCorrectLevel(user: { id: string; xp: number; level: number }) {
  const correctLevel = calculateLevel(user.xp);
  if (user.level !== correctLevel) {
    await prisma.user.update({
      where: { id: user.id },
      data: { level: correctLevel },
    });
    user.level = correctLevel;
  }
}

export interface CreateUserInput {
  telegramId: string;
  name?: string;
  referrerId?: string;
}

export const authService = {
  async findOrCreate(input: CreateUserInput) {
    let user = await prisma.user.findUnique({
      where: { telegramId: input.telegramId },
      include: {
        subscription: true,
        rituals: true,
        _count: { select: { analyses: true } },
      },
    });

    if (user) {
      await ensureCorrectLevel(user);
      const pending = await prisma.referral.findUnique({
        where: { refereeId: user.id },
      });
      if (pending && !pending.bonusGiven) {
        try {
          console.log(`[auth] Claiming pending referral for existing user ${user.id}`);
          const referrer = await prisma.user.findUnique({ where: { id: pending.referrerId } });
          if (referrer) {
            await prisma.referral.update({ where: { id: pending.id }, data: { bonusGiven: true } });
            await prisma.user.update({ where: { id: referrer.id }, data: { freeAnalyses: { increment: 2 }, referralCount: { increment: 1 } } });
            await prisma.user.update({ where: { id: user.id }, data: { freeAnalyses: { increment: 1 } } });
            console.log(`[auth] Pending referral claimed: referrer +2, existing user +1`);
          }
        } catch (e: any) {
          console.error(`[auth] Error claiming pending referral: ${e.message}`, e);
        }
      }
    }

    if (!user) {
      const created = await prisma.user.create({
        data: {
          telegramId: input.telegramId,
          name: input.name || null,
          freeAnalyses: 3,
        },
      });

      await prisma.ritual.create({
        data: { userId: created.id },
      });

      if (input.referrerId) {
        try {
          console.log(`[auth] Looking up referrer by telegramId=${input.referrerId}`);
          const referrer = await prisma.user.findUnique({
            where: { telegramId: input.referrerId },
          });

          if (referrer) {
            console.log(`[auth] Awarding referral: referrer=${referrer.id} -> referee=${created.id}`);
            await prisma.referral.create({
              data: {
                referrerId: referrer.id,
                refereeId: created.id,
                bonusGiven: true,
              },
            });
            await prisma.user.update({
              where: { id: referrer.id },
              data: {
                freeAnalyses: { increment: 2 },
                referralCount: { increment: 1 },
              },
            });
            await prisma.user.update({
              where: { id: created.id },
              data: {
                freeAnalyses: { increment: 1 },
              },
            });
            console.log(`[auth] Referral bonus awarded: referrer +2, referee +1`);
          } else {
            console.log(`[auth] Referrer NOT FOUND for telegramId=${input.referrerId}`);
          }
        } catch (e: any) {
          console.error(`[auth] Referral error: ${e.message}`, e);
        }
      }

      user = await prisma.user.findUnique({
        where: { id: created.id },
        include: {
          subscription: true,
          rituals: true,
          _count: { select: { analyses: true } },
        },
      });
    }

    return user!;
  },

  async getProfile(telegramId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        subscription: true,
        rituals: true,
        _count: {
          select: { analyses: true },
        },
      },
    });

    if (!user) throw new Error("User not found");

    await ensureCorrectLevel(user);

    return user;
  },
};
