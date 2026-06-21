import { prisma } from "../db";

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

    return user;
  },
};
