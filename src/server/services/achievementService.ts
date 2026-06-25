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
    await this.ensureDefinitions();
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        analyses: { take: 1 },
        rituals: true,
        _count: { select: { analyses: true } },
      },
    });
    if (!user) throw new Error("User not found");

    const achievements = await prisma.achievement.findMany();
    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId: user.id },
    });
    const earnedMap = new Map(userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt]));

    const totalXpFromAchievements = userAchievements.reduce((sum, ua) => {
      const ach = achievements.find((a) => a.id === ua.achievementId);
      return sum + (ach?.xpReward ?? 0);
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
