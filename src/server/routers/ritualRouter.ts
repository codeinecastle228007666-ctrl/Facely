import { router, protectedProcedure } from "../trpc";
import { ritualService } from "../services/ritualService";
import { prisma } from "../db";

export const ritualRouter = router({
  getStreak: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.telegramId },
    });
    if (!user) throw new Error("User not found");
    return ritualService.getStreak(user.id);
  }),
});
