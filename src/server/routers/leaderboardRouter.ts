import { router, protectedProcedure } from "../trpc";
import { prisma } from "../db";

type LeaderboardEntry = {
  id: string;
  name: string | null;
  value: number;
  rank: number;
  isMe: boolean;
  /**
   * 2026-06-29 — True on the appended "self" entry when the current
   * user is outside first 50 (or is not in the filtered set at all,
   * e.g. streak/referrals === 0). Lets the UI render a visual divider
   * and a "вы здесь" caption above this row without re-computing
   * server-side.
   */
  outOfRange?: boolean;
};

export const leaderboardRouter = router({
  topReferrers: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const top = await prisma.user.findMany({
      where: { referralCount: { gt: 0 } },
      orderBy: { referralCount: "desc" },
      take: 50,
      select: { id: true, name: true, referralCount: true },
    });

    const list: LeaderboardEntry[] = top.map((u, i) => ({
      id: u.id,
      name: u.name,
      value: u.referralCount,
      rank: i + 1,
      isMe: u.id === user.id,
    }));

    if (list.some((e) => e.isMe)) return list;

    // Strictly-greater count = number of users strictly ahead. We use
    // `gt` (not `gte`) so a user tied with rank=50 is ranked 51 — i.e.
    // they get a clear position rather than fighting over an
    // arbitrary slot in the top slice (Postgres tie-break is
    // implementation-defined).
    const ahead = await prisma.user.count({
      where: { referralCount: { gt: user.referralCount } },
    });
    list.push({
      id: user.id,
      name: user.name,
      value: user.referralCount,
      rank: ahead + 1,
      isMe: true,
      outOfRange: true,
    });
    return list;
  }),

  topStreaks: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const topRituals = await prisma.ritual.findMany({
      where: { streak: { gt: 0 } },
      orderBy: { streak: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });

    const list: LeaderboardEntry[] = topRituals.map((r, i) => ({
      id: r.user.id,
      name: r.user.name,
      value: r.streak,
      rank: i + 1,
      isMe: r.user.id === user.id,
    }));

    if (list.some((e) => e.isMe)) return list;

    // User may not have a Ritual row at all yet (zero-edge of
    // onboarding) — treat absence as streak=0.
    const myRitual = await prisma.ritual.findUnique({
      where: { userId: user.id },
      select: { streak: true },
    });
    const myStreak = myRitual?.streak ?? 0;

    const ahead = await prisma.ritual.count({
      where: { streak: { gt: myStreak } },
    });
    list.push({
      id: user.id,
      name: user.name,
      value: myStreak,
      rank: ahead + 1,
      isMe: true,
      outOfRange: true,
    });
    return list;
  }),

  topLevel: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const top = await prisma.user.findMany({
      orderBy: { level: "desc" },
      take: 50,
      select: { id: true, name: true, level: true },
    });

    const list: LeaderboardEntry[] = top.map((u, i) => ({
      id: u.id,
      name: u.name,
      value: u.level,
      rank: i + 1,
      isMe: u.id === user.id,
    }));

    if (list.some((e) => e.isMe)) return list;

    const ahead = await prisma.user.count({
      where: { level: { gt: user.level } },
    });
    list.push({
      id: user.id,
      name: user.name,
      value: user.level,
      rank: ahead + 1,
      isMe: true,
      outOfRange: true,
    });
    return list;
  }),
});
