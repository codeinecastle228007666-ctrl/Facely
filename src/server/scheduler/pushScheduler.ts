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

  if (inactiveUsers.length > 0) {
    console.log(`[Scheduler] Sent inactivity reminders to ${inactiveUsers.length} users`);
  }
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
          "\u{1F4CA} \u0415\u0436\u0435\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442",
          `\u0422\u0432\u043E\u0439 \u043F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u043A\u043E\u0436\u0438 \u0433\u043E\u0442\u043E\u0432! \u0417\u0430\u0433\u043B\u044F\u043D\u0438 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B \u043E\u0442\u0447\u0451\u0442\u043E\u0432.`,
        );
      }
    }
  }

  console.log(`[Scheduler] Weekly reports checked for ${subscribers.length} subscribers`);
}

async function checkStreakExpiring() {
  const now = new Date();
  const in5Days = new Date(now.getTime() + 5 * 86400000);

  const users = await prisma.ritual.findMany({
    where: {
      nextAnalysisDate: {
        not: null,
        lte: in5Days,
        gte: now,
      },
      weeklyStreak: { gt: 0 },
    },
    include: { user: { select: { telegramId: true } } },
  });

  for (const ritual of users) {
    if (!ritual.nextAnalysisDate) continue;
    const diffDays = Math.ceil((ritual.nextAnalysisDate.getTime() - now.getTime()) / 86400000);
    if (diffDays <= 2) {
      await pushService.sendStreakExpiring(ritual.user.telegramId, diffDays);
      console.log(`[Scheduler] Streak expiring for user ${ritual.userId}: ${diffDays} days`);
    }
  }
}

async function checkTimeForAnalysis() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const users = await prisma.user.findMany({
    where: {
      analyses: {
        none: {
          createdAt: { gte: sevenDaysAgo },
        },
      },
      OR: [
        { freeAnalyses: { gt: 0 } },
        { paidAnalyses: { gt: 0 } },
        {
          subscription: {
            status: "active",
            endDate: { gt: new Date() },
          },
        },
      ],
    },
    select: { telegramId: true },
  });

  for (const user of users) {
    await pushService.sendTimeForAnalysis(user.telegramId);
  }

  console.log(`[Scheduler] Sent time-for-analysis to ${users.length} users`);
}

async function checkWeeklyProductPick() {
  const now = new Date();
  if (now.getDay() !== 1) return;

  const users = await prisma.user.findMany({
    select: { telegramId: true },
  });

  for (const user of users) {
    await pushService.sendWeeklyProductPick(user.telegramId);
  }

  console.log(`[Scheduler] Sent weekly product picks to ${users.length} users`);
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

  cron.schedule("0 */6 * * *", async () => {
    await Promise.all([
      checkStreakExpiring().catch(console.error),
      checkTimeForAnalysis().catch(console.error),
    ]);
  });

  cron.schedule("0 9 * * 1", () => {
    checkWeeklyProductPick().catch(console.error);
  });

  console.log("[Scheduler] Push notification scheduler started");
}

const isMainModule = process.argv[1]?.includes("pushScheduler");
if (isMainModule) {
  startScheduler();
  console.log("[Scheduler] Running in standalone mode");
}
