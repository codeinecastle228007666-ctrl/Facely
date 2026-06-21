import { router } from "../trpc";
import { authRouter } from "./authRouter";
import { analysisRouter } from "./analysisRouter";
import { ritualRouter } from "./ritualRouter";
import { subscriptionRouter } from "./subscriptionRouter";
import { referralRouter } from "./referralRouter";
import { reportRouter } from "./reportRouter";

export const appRouter = router({
  auth: authRouter,
  analysis: analysisRouter,
  ritual: ritualRouter,
  subscription: subscriptionRouter,
  referral: referralRouter,
  report: reportRouter,
});

export type AppRouter = typeof appRouter;
