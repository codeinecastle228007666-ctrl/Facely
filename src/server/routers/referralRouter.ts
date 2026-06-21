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
});
