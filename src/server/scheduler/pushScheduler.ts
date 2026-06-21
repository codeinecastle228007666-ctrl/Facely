import cron from "node-cron";
import { prisma } from "../db";
import { pushService } from "../services/pushService";

const INACTIVITY_THRESHOLD_HOURS = 24;
const SUBSCRIPTION_OFFER_COOLDOWN_HOURS = 72;

async function checkInactiveUsers() {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - INACTIVITY_THRESHOLD_HOURS);

  const inactiveUsers = await prisma.user.findMany({
    where: {
      analyses: {
        none: {
          createdAt: { gte: threshold },
        },
      },
    },
    select: { telegramId: true },
  });

  for (const user of inactiveUsers) {
    await pushService.sendInactivityReminder(user.telegramId);
  }

  console.log(
    `[Scheduler] Sent inactivity reminders to ${inactiveUsers.length} users`,
  );
}

async function checkSubscriptionOffer() {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - 1);

  const users = await prisma.user.findMany({
    where: {
      freeAnalyses: 0,
      paidAnalyses: 0,
      lastSubscriptionOfferSent: null,
      OR: [
        { subscription: null },
        {
          subscription: {
            OR: [
              { status: { not: "active" } },
              { endDate: { lte: new Date() } },
            ],
          },
        },
      ],
      analyses: {
        some: {
          createdAt: { lte: threshold },
        },
      },
    },
    select: { id: true, telegramId: true, lastSubscriptionOfferSent: true },
  });

  for (const user of users) {
    await pushService.sendSubscriptionOffer(user.telegramId);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSubscriptionOfferSent: new Date() },
    });
  }

  if (users.length > 0) {
    console.log(`[Scheduler] Sent subscription offers to ${users.length} users`);
  }

  const cooldownThreshold = new Date();
  cooldownThreshold.setHours(cooldownThreshold.getHours() - SUBSCRIPTION_OFFER_COOLDOWN_HOURS);

  const reEligible = await prisma.user.findMany({
    where: {
      freeAnalyses: 0,
      paidAnalyses: 0,
      lastSubscriptionOfferSent: { lte: cooldownThreshold },
      OR: [
        { subscription: null },
        {
          subscription: {
            OR: [
              { status: { not: "active" } },
              { endDate: { lte: new Date() } },
            ],
          },
        },
      ],
      analyses: {
        some: {
          createdAt: { gte: cooldownThreshold },
        },
      },
    },
    select: { id: true, telegramId: true },
  });

  for (const user of reEligible) {
    await pushService.sendSubscriptionOffer(user.telegramId);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSubscriptionOfferSent: new Date() },
    });
  }

  if (reEligible.length > 0) {
    console.log(`[Scheduler] Re-sent subscription offers to ${reEligible.length} users`);
  }
}

async function checkWeeklyReports() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const subscribers = await prisma.user.findMany({
    where: {
      subscription: {
        status: "active",
        endDate: { gt: new Date() },
      },
    },
    select: { id: true, telegramId: true },
  });

  for (const user of subscribers) {
    const existingReport = await prisma.report.findFirst({
      where: {
        userId: user.id,
        generatedAt: { gte: sevenDaysAgo },
      },
    });

    if (!existingReport) {
      const { reportService } = await import("../services/reportService");
      const report = await reportService.generateWeeklyReport(user.id);
      if (report) {
        await pushService.send(
          user.telegramId,
          "📊 Еженедельный отчёт",
          `Твой прогресс кожи готов! Загляни в раздел отчётов.`,
        );
      }
    }
  }

  console.log(
    `[Scheduler] Weekly reports checked for ${subscribers.length} subscribers`,
  );
}

export function startScheduler() {
  console.log("[Scheduler] Starting push notification scheduler...");

  cron.schedule("0 */6 * * *", () => {
    checkInactiveUsers().catch(console.error);
  });

  cron.schedule("0 */4 * * *", () => {
    checkSubscriptionOffer().catch(console.error);
  });

  cron.schedule("0 10 * * 1", () => {
    checkWeeklyReports().catch(console.error);
  });

  console.log("[Scheduler] Push notification scheduler started");
}

const isMainModule = process.argv[1]?.includes("pushScheduler");
if (isMainModule) {
  startScheduler();
  console.log("[Scheduler] Running in standalone mode");
}
