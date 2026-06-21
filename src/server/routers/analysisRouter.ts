import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { analysisService } from "../services/analysisService";

export const analysisRouter = router({
  analyze: protectedProcedure
    .input(
      z.object({
        photoBase64: z.string().min(1, "Photo is required"),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return analysisService.analyze(
        ctx.telegramId,
        input.photoBase64,
        input.description,
      );
    }),

  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return analysisService.getHistory(ctx.telegramId, input.limit, input.offset);
    }),
});
