import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { subscriptionService } from "../services/subscriptionService";
import { prisma } from "../db";

export const subscriptionRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.telegramId },
    });
    if (!user) throw new Error("User not found");
    return subscriptionService.getStatus(user.id);
  }),

  activate: protectedProcedure
    .input(
      z.object({
        type: z.enum(["trial", "paid"]).default("paid"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
      });
      if (!user) throw new Error("User not found");
      return subscriptionService.activate(user.id, input.type);
    }),

  purchaseAnalysis: protectedProcedure
    .input(
      z.object({
        quantity: z.number().min(1).max(100).default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
      });
      if (!user) throw new Error("User not found");
      return subscriptionService.purchaseAnalysis(user.id, input.quantity);
    }),

  purchaseSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.telegramId },
    });
    if (!user) throw new Error("User not found");
    return subscriptionService.purchaseSubscription(user.id);
  }),
});
