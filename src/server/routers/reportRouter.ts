import { router, protectedProcedure } from "../trpc";
import { reportService } from "../services/reportService";

export const reportRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return reportService.getReports(ctx.telegramId);
  }),
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    return reportService.generateForUser(ctx.telegramId);
  }),
});
