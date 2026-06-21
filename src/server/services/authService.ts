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
        const referrer = await prisma.user.findUnique({
          where: { telegramId: input.referrerId },
        });

        if (referrer) {
          await prisma.referral.create({
            data: {
              referrerId: referrer.id,
              refereeId: created.id,
              bonusGiven: false,
            },
          });
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
