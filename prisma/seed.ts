import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

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
