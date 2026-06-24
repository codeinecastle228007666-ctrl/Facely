import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { routineService } from "../services/routineService";

const stepSchema = z.object({
  inventoryId: z.string().optional(),
  productName: z.string().min(1),
  timeOfDay: z.enum(["morning", "evening"]),
  dayOfWeek: z.number().min(0).max(6).nullable().optional(),
  stepOrder: z.number(),
});

export const routineRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return routineService.get(ctx.telegramId);
  }),

  save: protectedProcedure
    .input(z.object({ steps: z.array(stepSchema) }))
    .mutation(async ({ ctx, input }) => {
      return routineService.save(ctx.telegramId, input.steps);
    }),

  removeStep: protectedProcedure
    .input(z.object({ stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return routineService.removeStep(ctx.telegramId, input.stepId);
    }),
});
