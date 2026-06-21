import { router, protectedProcedure } from "../trpc";
import { achievementService } from "../services/achievementService";

export const achievementRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return achievementService.getAchievements(ctx.telegramId);
  }),
});
