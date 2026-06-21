import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { referralService } from "../services/referralService";
import { prisma } from "../db";

export const referralRouter = router({
  claimBonus: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.telegramId },
    });
    if (!user) throw new Error("User not found");
    return referralService.claimReferralBonus(user.id);
  }),

  getReferralStats: protectedProcedure.query(async ({ ctx }) => {
    return referralService.getReferralStats(ctx.telegramId);
  }),
});
