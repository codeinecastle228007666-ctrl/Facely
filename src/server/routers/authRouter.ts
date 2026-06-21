import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { authService } from "../services/authService";

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        telegramId: z.string(),
        name: z.string().optional(),
        referrerId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return authService.findOrCreate(input);
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return authService.getProfile(ctx.telegramId);
  }),
});
