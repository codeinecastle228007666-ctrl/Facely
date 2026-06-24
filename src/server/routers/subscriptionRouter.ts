import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { subscriptionService } from "../services/subscriptionService";
import { prisma } from "../db";

export const subscriptionRouter = router({
  prices: protectedProcedure.query(() => {
    return subscriptionService.getPrices();
  }),

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

  createStarsInvoice: protectedProcedure
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
      return subscriptionService.createStarsInvoice(user.id, input.quantity);
    }),

  confirmStarsPayment: protectedProcedure
    .input(
      z.object({
        payload: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
      });
      if (!user) throw new Error("User not found");

      const quantity = parseInt(input.payload.replace("analysis_", "").split("_")[0], 10) || 1;
      return subscriptionService.confirmStarsPayment(user.id, quantity);
    }),

  createChatStarsInvoice: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.telegramId },
    });
    if (!user) throw new Error("User not found");
    return subscriptionService.createChatStarsInvoice(user.id);
  }),
});
