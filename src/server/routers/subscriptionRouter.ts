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

  /**
   * 2026-06-26 Phase 1.5 — called by PurchaseModal when user clicks
   * "Картой" on a tier card. Returns a short ref the user will see
   * immediately, before they make their bank transfer (so they can
   * put it in the comment). Idempotent: re-opening the modal on the
   * same tier returns the same ref. `amount` is server-computed
   * (priceForCard) so the client can't manipulate it.
   */
  previewCardTransfer: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["single", "pack5", "monthly", "fifteen"]).default("single"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
      });
      if (!user) throw new Error("User not found");
      return subscriptionService.previewCardTransfer(user.id, input.tier);
    }),

  reportCardTransfer: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["single", "pack5", "monthly", "fifteen"]).default("single"),
        // 2026-06-26 Phase 1.5 — ref issued by `previewCardTransfer`.
        // Server uses it to find the matching draft and transition it
        // from "draft" → "submitted". If omitted (or stale), server
        // falls back to creating a brand-new claim so the user flow
        // never blocks. Keep it optional + non-strict so legacy Phase 1
        // clients (if any survived) still work.
        expectedReference: z.string().regex(/^R-[A-Z0-9]{4}-[A-Z0-9]{4}$/).optional(),
        // User-typed word they put in their bank comment, for admin
        // cross-check. Optional.
        submittedReference: z.string().max(64).optional(),
        // ~1MB raw image ⨯ 1.33× base64 inflate ≈ 1.4 MB — server side cap.
        screenshotBase64: z.string().max(1_500_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
      });
      if (!user) throw new Error("User not found");
      return subscriptionService.reportCardTransfer(user.id, input.tier, {
        expectedReference: input.expectedReference,
        submittedReference: input.submittedReference,
        screenshotBase64: input.screenshotBase64,
      });
    }),
});
