import { prisma } from "../db";

const ACHIEVEMENT_DEFS = [
  { key: "first_analysis", title: "Первый анализ", description: "Проведи свой первый анализ кожи", icon: "🔬", xpReward: 10 },
  { key: "week_streak", title: "Недельный стрик", description: "Достигни 7-дневного стрика", icon: "🔥", xpReward: 20 },
  { key: "month_streak", title: "Месячный стрик", description: "Достигни 30-дневного стрика", icon: "👑", xpReward: 50 },
  { key: "five_referrals", title: "5 рефералов", description: "Пригласи 5 друзей", icon: "👥", xpReward: 30 },
  { key: "level_10", title: "Уровень 10", description: "Достигни 10-го уровня", icon: "⭐", xpReward: 40 },
  { key: "level_25", title: "Уровень 25", description: "Достигни 25-го уровня", icon: "🌟", xpReward: 80 },
  { key: "xp_100", title: "100 XP", description: "Заработай 100 XP", icon: "✨", xpReward: 15 },
  { key: "hydration_master", title: "Повелитель влаги", description: "Сделай 75 анализов кожи — AI научится узнавать тебя точнее и подбирать уход под твой тип", icon: "💧", xpReward: 25 },
  { key: "consistent_care", title: "Дисциплинированный уход", description: "Удерживай регулярный анализ 5 дней подряд", icon: "🔥", xpReward: 15 },
];

// Progress targets are NOT stored in the Achievement row (Prisma schema has no
// `target` column) — this map is the single source of truth, used by
// getAchievements() to attach progress metadata to qualifying achievements.
const ACHIEVEMENT_PROGRESS_TARGETS: Record<string, { current: (user: { _count: { analyses: number }; rituals: Array<{ streak: number } | null> }) => number; target: number }> = {
  hydration_master: { current: (u) => u._count.analyses, target: 75 },
  consistent_care: { current: (u) => u.rituals[0]?.streak ?? 0, target: 5 },
};

export const achievementService = {
  async ensureDefinitions() {
    for (const def of ACHIEVEMENT_DEFS) {
      await prisma.achievement.upsert({
        where: { key: def.key },
        update: { icon: def.icon, title: def.title, description: def.description, xpReward: def.xpReward },
        create: def,
      });
    }
  },

  async checkAndAward(userId: string) {
    await this.ensureDefinitions();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        analyses: { take: 1 },
        rituals: true,
        _count: { select: { analyses: true } },
      },
    });
    if (!user) return [];

    const ritual = Array.isArray(user.rituals) ? user.rituals[0] : user.rituals;

    const awards: string[] = [];
    const allAchievements = await prisma.achievement.findMany();
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    });
    const earned = new Set(userAchievements.map((ua) => ua.achievementId));

    const checkAndAward = async (key: string, condition: boolean) => {
      if (!condition) return;
      const ach = allAchievements.find((a) => a.key === key);
      if (!ach || earned.has(ach.id)) return;

      await prisma.userAchievement.create({
        data: { userId, achievementId: ach.id },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { xp: { increment: ach.xpReward } },
      });
      awards.push(ach.title);
    };

    await checkAndAward("first_analysis", user._count.analyses >= 1);
    await checkAndAward("week_streak", (ritual?.streak ?? 0) >= 7);
    await checkAndAward("month_streak", (ritual?.streak ?? 0) >= 30);
    await checkAndAward("five_referrals", user.referralCount >= 5);
    await checkAndAward("level_10", user.level >= 10);
    await checkAndAward("level_25", user.level >= 25);
    await checkAndAward("xp_100", user.xp >= 100);
    await checkAndAward("hydration_master", user._count.analyses >= 75);
    await checkAndAward("consistent_care", (ritual?.streak ?? 0) >= 5);

    return awards;
  },

  async getAchievements(telegramId: string) {
    // 2026-06-30 — Removed `ensureDefinitions()` from this read-only call.
    // Definitions are static seed data populated by `prisma/seed.ts` in
    // the deployment pipeline. The previous behaviour ran 9 upserts on
    // EVERY modal open — the modal feels slow because every open paid for
    // nine `INSERT ON CONFLICT DO UPDATE` round-trips. `ensureDefinitions`
    // still runs in `checkAndAward()` so newly shipped achievements
    // appear without re-seeding in deploys that don't run `db seed`.
    const user = await prisma.user.findUnique({
      where: { telegramId },
      // 2026-06-30 — `analyses: { take: 1 }` removed (left-join with row
      // fetch that nothing reads; `_count.analyses` covers progress for
      // `hydration_master`). `rituals` narrowed to `select: { streak }`
      // because that's the only field the progress target reads.
      include: {
        rituals: { select: { streak: true } },
        _count: { select: { analyses: true } },
      },
    });
    if (!user) throw new Error("User not found");

    // 2026-06-30 — Parallel fetch: previously `findMany(achievements)`
    // completed before `findMany(userAchievements)` started. Both hit the
    // same Postgres pooler connection, so total latency was the SUM.
    // Concurrent execution trims it to max(per-call). Same for the user
    // fetch — kick it off in parallel with the two list queries below.
    // (`user.findUnique` above already awaited; that's the only
    // sequential dependency because earnedMap and progress both read
    // `user.id` / `user._count.analyses`. Could shave further by issuing
    // all three in Promise.all via the unique `telegramId` and stitching
    // post-response, but the marginal saving is dominated by the user
    // round-trip already in flight.)
    const [achievements, userAchievements] = await Promise.all([
      prisma.achievement.findMany(),
      prisma.userAchievement.findMany({
        where: { userId: user.id },
        // Skinny select: only `achievementId` + `unlockedAt` are read.
        // Default would also pull the row `id` cuid (no consumer).
        select: { achievementId: true, unlockedAt: true },
      }),
    ]);
    const earnedMap = new Map(
      userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt]),
    );
    // 2026-06-30 — Map lookup for `xpReward` aggregation, replaces the
    // previous `achievements.find(...)` inside `reduce`. Small N (~9),
    // but cleaner intent and avoids O(N²) re-scans if defs grow.
    const rewardById = new Map(
      achievements.map((a) => [a.id, a.xpReward] as const),
    );
    const totalXpFromAchievements = userAchievements.reduce((sum, ua) => {
      return sum + (rewardById.get(ua.achievementId) ?? 0);
    }, 0);

    return {
      achievements: achievements.map((a) => {
        const targetDef = ACHIEVEMENT_PROGRESS_TARGETS[a.key];
        return {
          ...a,
          unlocked: earnedMap.has(a.id),
          unlockedAt: earnedMap.get(a.id)?.toISOString() ?? null,
          progress: targetDef
            ? { current: targetDef.current(user), target: targetDef.target }
            : undefined,
        };
      }),
      totalXpFromAchievements,
    };
  },
};
