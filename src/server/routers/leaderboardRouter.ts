import { router, protectedProcedure } from "../trpc";
import { prisma } from "../db";

export const leaderboardRouter = router({
  topReferrers: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const users = await prisma.user.findMany({
      where: { referralCount: { gt: 0 } },
      orderBy: { referralCount: "desc" },
      take: 50,
      select: { id: true, name: true, referralCount: true },
    });

    return users.map((u, i) => ({
      id: u.id, name: u.name, value: u.referralCount, rank: i + 1, isMe: u.id === user.id,
    }));
  }),

  topStreaks: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const rituals = await prisma.ritual.findMany({
      where: { streak: { gt: 0 } },
      orderBy: { streak: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });

    return rituals.map((r, i) => ({
      id: r.user.id,
      name: r.user.name,
      value: r.streak,
      rank: i + 1,
      isMe: r.user.id === user.id,
    }));
  }),

  topLevel: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const users = await prisma.user.findMany({
      orderBy: { level: "desc" },
      take: 50,
      select: { id: true, name: true, level: true },
    });

    return users.map((u, i) => ({
      id: u.id, name: u.name, value: u.level, rank: i + 1, isMe: u.id === user.id,
    }));
  }),
});
