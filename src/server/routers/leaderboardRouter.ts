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

// 2026-06-29 — 8 fake users injected into every leaderboard query so
// the rating page feels alive even on a fresh install with zero real
// activity. Each fake entry carries plausible-but-synthetic values
// for all three leaderboard dimensions (referrers, streaks, level),
// with a deliberate overlap pattern: the highest-`referralCount`
// fake and the highest-`streak` fake share the same id so the same
// person can plausibly top two categories.
//
// IDs use a `fake-` prefix to make them impossible to collide with
// real cuids (lower-case alphas only, no cuid-alphabet characters
// here). `isMe: false` is hard-coded in the merge step, so the
// current user cannot accidentally be flagged as their own fake.
// Anyone reading the User table by `telegramId NOT IN fake_ids`
// doesn't need to do anything here — fakes don't exist in the User
// table, so they're already invisible to every other query.
const FAKE_USERS = [
  // 2026-06-29 — Varied nicknames on purpose: full russian ФИ,
  // latin gaming-style handles, with/without emoji, short forms.
  // Looks more like a real Telegram rating than 8 copies of the same
  // "Имя + И." template. Each fake keeps plausible-but-synthetic
  // values for all three metrics.
  { name: "Анна Светлова",                       referralCount: 14, streak: 32, level: 12 },
  { name: "Михаил Поляков 💪",                   referralCount: 11, streak: 27, level: 11 },
  { name: "kosmetik_elena",                      referralCount: 9,  streak: 22, level: 9  },
  { name: "Артём 🦊",                            referralCount: 7,  streak: 18, level: 10 },
  { name: "Оля Морозова",                        referralCount: 6,  streak: 15, level: 8  },
  { name: "skincare_dmitry",                     referralCount: 5,  streak: 12, level: 7  },
  { name: "🌸 Софи Лебедева",                    referralCount: 4,  streak: 9,  level: 6  },
  { name: "Игорь Новиков",                       referralCount: 3,  streak: 7,  level: 5  },
] as const;

type FakeMetric = "referralCount" | "streak" | "level";

function fakeEntriesSorted(metric: FakeMetric): LeaderboardEntry[] {
  return FAKE_USERS
    .map((f, i) => ({
      id: `fake-${metric}-${i}`,
      name: f.name,
      value: f[metric],
      rank: 0,
      isMe: false,
    }))
    .sort((a, b) => b.value - a.value)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

export const leaderboardRouter = router({
  topReferrers: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const fakes = fakeEntriesSorted("referralCount");

    const top = await prisma.user.findMany({
      where: { referralCount: { gt: 0 } },
      orderBy: { referralCount: "desc" },
      take: 50,
      select: { id: true, name: true, referralCount: true },
    });

    // Real users get ranks offset by the fake count so a user with
    // referralCount=2 sits at rank = 8 + (real_users_strictly_ahead) + 1.
    const offset = fakes.length;
    const realEntries: LeaderboardEntry[] = top.map((u, i) => ({
      id: u.id,
      name: u.name,
      value: u.referralCount,
      rank: i + 1 + offset,
      isMe: u.id === user.id,
    }));

    const list: LeaderboardEntry[] = [...fakes, ...realEntries];

    if (list.some((e) => e.isMe)) return list;

    // Strictly-greater count against the full user table (fakes
    // aren't in this table so they're already excluded from the
    // count). We then add `offset` so the current user's rank
    // accounts for the synthetic users ahead of them too.
    const realAhead = await prisma.user.count({
      where: { referralCount: { gt: user.referralCount } },
    });
    const fakesAhead = fakes.filter((f) => f.value > user.referralCount).length;
    list.push({
      id: user.id,
      name: user.name,
      value: user.referralCount,
      rank: realAhead + fakesAhead + 1,
      isMe: true,
      outOfRange: true,
    });
    return list;
  }),

  topStreaks: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const fakes = fakeEntriesSorted("streak");

    const topRituals = await prisma.ritual.findMany({
      where: { streak: { gt: 0 } },
      orderBy: { streak: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });

    const offset = fakes.length;
    const realEntries: LeaderboardEntry[] = topRituals.map((r, i) => ({
      id: r.user.id,
      name: r.user.name,
      value: r.streak,
      rank: i + 1 + offset,
      isMe: r.user.id === user.id,
    }));

    const list: LeaderboardEntry[] = [...fakes, ...realEntries];

    if (list.some((e) => e.isMe)) return list;

    // User may not have a Ritual row at all yet (zero-edge of
    // onboarding) — treat absence as streak=0.
    const myRitual = await prisma.ritual.findUnique({
      where: { userId: user.id },
      select: { streak: true },
    });
    const myStreak = myRitual?.streak ?? 0;

    const realAhead = await prisma.ritual.count({
      where: { streak: { gt: myStreak } },
    });
    const fakesAhead = fakes.filter((f) => f.value > myStreak).length;
    list.push({
      id: user.id,
      name: user.name,
      value: myStreak,
      rank: realAhead + fakesAhead + 1,
      isMe: true,
      outOfRange: true,
    });
    return list;
  }),

  topLevel: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({ where: { telegramId: ctx.telegramId } });
    if (!user) throw new Error("User not found");

    const fakes = fakeEntriesSorted("level");

    const top = await prisma.user.findMany({
      orderBy: { level: "desc" },
      take: 50,
      select: { id: true, name: true, level: true },
    });

    const offset = fakes.length;
    const realEntries: LeaderboardEntry[] = top.map((u, i) => ({
      id: u.id,
      name: u.name,
      value: u.level,
      rank: i + 1 + offset,
      isMe: u.id === user.id,
    }));

    const list: LeaderboardEntry[] = [...fakes, ...realEntries];

    if (list.some((e) => e.isMe)) return list;

    const realAhead = await prisma.user.count({
      where: { level: { gt: user.level } },
    });
    const fakesAhead = fakes.filter((f) => f.value > user.level).length;
    list.push({
      id: user.id,
      name: user.name,
      value: user.level,
      rank: realAhead + fakesAhead + 1,
      isMe: true,
      outOfRange: true,
    });
    return list;
  }),
});
