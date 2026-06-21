import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const achievements = [
    { key: "first_analysis", title: "Первый анализ", description: "Проведи свой первый анализ кожи", icon: "analysis", xpReward: 10 },
    { key: "week_streak", title: "Недельный стрик", description: "Достигни 7-дневного стрика", icon: "streak", xpReward: 20 },
    { key: "month_streak", title: "Месячный стрик", description: "Достигни 30-дневного стрика", icon: "crown", xpReward: 50 },
    { key: "five_referrals", title: "5 рефералов", description: "Пригласи 5 друзей", icon: "referral", xpReward: 30 },
    { key: "level_10", title: "Уровень 10", description: "Достигни 10-го уровня", icon: "star", xpReward: 40 },
    { key: "level_25", title: "Уровень 25", description: "Достигни 25-го уровня", icon: "diamond", xpReward: 80 },
    { key: "xp_100", title: "100 XP", description: "Заработай 100 XP", icon: "xp", xpReward: 15 },
  ];

  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: { key: achievement.key },
      update: {},
      create: achievement,
    });
  }

  console.log(`Seeded ${achievements.length} achievements`);

  const user = await prisma.user.upsert({
    where: { telegramId: "123456789" },
    update: {},
    create: {
      telegramId: "123456789",
      name: "Test User",
      freeAnalyses: 3,
    },
  });

  await prisma.ritual.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      streak: 0,
      maxStreak: 0,
    },
  });

  console.log(`Seeded user: ${user.name} (${user.telegramId})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
