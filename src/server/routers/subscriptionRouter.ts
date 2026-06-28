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

  // 2026-06-28 — "fifteen" tier REMOVED from previewCardTransfer /
  // reportCardTransfer enums. The old union accepted it, but
  // PRICES.RUB["fifteen"] = undefined → priceForCard() returned 0 →
  // a user could mint a zero-cost CardTransferClaim in the admin queue.
  // Three-of-four tiers (single | pack5 | monthly) cover the current
  // matrix; if/when a "fifteen" tier is added, the schema + pricing
  // MUST land in lockstep with this enum (don't widen one without the
  // others).
  previewCardTransfer: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["single", "pack5", "monthly"]).default("single"),
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
        tier: z.enum(["single", "pack5", "monthly"]).default("single"),
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
  // Stars is a one-time payment that internally activates a 30-day
  // Subscription (Telegram Stars do NOT support recurring payments
  // natively), so the kind/sub-amount routing happens in webhook.
  createStarsInvoice: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["single", "pack5", "monthly"]).default("single"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
      });
      if (!user) throw new Error("User not found");
      return subscriptionService.createStarsInvoice(user.id, input.tier);
    }),

  // 2026-06-28 — REMOVED `purchaseSubscription()`. The previous
  // implementation credited XP + activated a 30-day Subscription on a
  // bare tRPC call without verifying any payment intent — anyone with
  // a valid Telegram initData could farm XP + free monthly access.
  // Activation is now strictly webhook-deprecated: the `successful_payment`
  // handler in /api/webhook credits on receipt of a real Telegram
  // Stars payment (one-time, "subscription_monthly_<uid>" payload).
  // Card-transfer path goes through `reportCardTransfer` → admin
  // approves via `scripts/credit-by-ref.ts`.

  // 2026-06-26 — removed `confirmStarsPayment`. The flow is now
  // webhook-driven: `tg.openInvoice` calls back with paid/cancelled,
  // and the actual credit happens server-side via Telegram's webhook
  // hitting our /api/webhook route. The old front-end confirm route
  // was vestigial and would have mis-read the new tier-based payload.

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
