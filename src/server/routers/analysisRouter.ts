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
      try {
        return await analysisService.analyze(
          ctx.telegramId,
          input.photoBase64,
          input.description,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        if (message === "no_analyses_left" || message === "no_free_analyses") {
          throw new Error(message);
        }
        throw e;
      }
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

  getComparison: protectedProcedure
    .input(
      z.object({
        analysis1Id: z.string(),
        analysis2Id: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return analysisService.getComparison(ctx.telegramId, input.analysis1Id, input.analysis2Id);
    }),
});
