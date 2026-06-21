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
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: input.telegramId,
          name: input.name || null,
          freeAnalyses: 3,
        },
      });

      await prisma.ritual.create({
        data: { userId: user.id },
      });

      if (input.referrerId) {
        const referrer = await prisma.user.findUnique({
          where: { telegramId: input.referrerId },
        });

        if (referrer) {
          await prisma.referral.create({
            data: {
              referrerId: referrer.id,
              refereeId: user.id,
              bonusGiven: false,
            },
          });
        }
      }
    }

    return user;
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
