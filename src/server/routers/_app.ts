import { router } from "../trpc";
import { authRouter } from "./authRouter";
import { analysisRouter } from "./analysisRouter";
import { ritualRouter } from "./ritualRouter";
import { subscriptionRouter } from "./subscriptionRouter";
import { referralRouter } from "./referralRouter";
import { reportRouter } from "./reportRouter";
import { chatRouter } from "./chatRouter";
import { achievementRouter } from "./achievementRouter";
import { leaderboardRouter } from "./leaderboardRouter";
import { inventoryRouter } from "./inventoryRouter";
import { routineRouter } from "./routineRouter";

export const appRouter = router({
  auth: authRouter,
  analysis: analysisRouter,
  ritual: ritualRouter,
  subscription: subscriptionRouter,
  referral: referralRouter,
  report: reportRouter,
  chat: chatRouter,
  achievement: achievementRouter,
  leaderboard: leaderboardRouter,
  inventory: inventoryRouter,
  routine: routineRouter,
});

export type AppRouter = typeof appRouter;
