import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adminProtectedProcedure,
  publicProcedure,
  router,
} from "../trpc";
import { adminService } from "../services/adminService";
import { ADMIN_PANEL_DISABLED_ERROR } from "../utils/adminAuth";

/**
 * 2026-06-26 — /admin tRPC surface. All procedures here use
 * `adminProtectedProcedure` (cookie-based auth, NOT Telegram) so
 * the panel works from a regular browser without the Mini App.
 *
 * The `status` procedure is intentionally `publicProcedure` so the
 * login screen can render "panel disabled" without holding a token
 * to begin with.
 */
export const adminRouter = router({
  /**
   * Public: lets the client know whether the panel is configured and
   * what to render. Returns `{ enabled, errorMessage }` — never throws.
   */
  status: publicProcedure.query(() => ({
    enabled:
      !!process.env.ADMIN_PANEL_SECRET &&
      process.env.ADMIN_PANEL_SECRET.length >= 8,
    errorMessage: ADMIN_PANEL_DISABLED_ERROR,
  })),

  /** Who am I — returns the issued-at timestamp from the cookie. */
  me: adminProtectedProcedure.query(({ ctx }) => ({
    authenticated: true as const,
    adminTelegramId: ctx.adminSession?.telegramId ?? "admin",
    issuedAt: ctx.adminSession?.issuedAt ?? Date.now(),
  })),

  /** Search users by telegramId / username / name substring. */
  searchUsers: adminProtectedProcedure
    .input(z.object({ query: z.string().min(1).max(64) }))
    .query(({ input }) => adminService.searchUsers(input.query)),

  /** Full user card incl. subscription + rituals. */
  getUserDetails: adminProtectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => adminService.getUserDetails(input.id)),

  /**
   * Apply a grant. `amount` is zod-clamped to 1..10000 — caps blast
   * radius of a typo but doesn't really protect against malicious
   * admin (they could grant 10000 × N times). The point is detecting
   * fat-finger, not preventing intentional drain.
   */
  grant: adminProtectedProcedure
    .input(
      z.object({
        targetUserId: z.string().min(1),
        kind: z.enum([
          "paidAnalyses",
          "freeChatQuestions",
          "streakFreeze",
          "subscriptionDays",
          "proTrialDays",
          "xp",
        ]),
        amount: z.number().int().min(1).max(10000),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await adminService.grant(ctx.adminSession!.telegramId, input);
      } catch (e: any) {
        // Surface unrecognized errors so admin sees what went wrong.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e?.message ?? "Grant failed",
        });
      }
    }),

  /** Most-recent N grants globally (audit-log feed). */
  listGrants: adminProtectedProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(200).default(30) }),
    )
    .query(({ input }) => adminService.listRecentGrants(input.limit)),

  /**
   * Browse-all users. Paginated, no search filter. Sorted by
   * `paidAnalyses DESC, createdAt DESC` on the server side so paying
   * users surface first.
   */
  listUsers: adminProtectedProcedure
    .input(
      z.object({
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => adminService.listUsers(input)),

  /**
   * CardTransferClaim feed with status filter:
   *   pending   — admin was notified, awaiting confirm
   *   drafts    — modal opened, user hasn't clicked "I paid" yet
   *   confirmed — already credited OR cancelled
   *   all       — every row
   */
  listCardClaims: adminProtectedProcedure
    .input(
      z.object({
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        status: z
          .enum(["pending", "drafts", "confirmed", "all"])
          .default("pending"),
      }),
    )
    .query(({ input }) => adminService.listCardClaims(input)),

  /**
   * ProcessedInvoice feed (Stars auto-credits). Filterable by userId
   * or kind (analysis/chat/subscription).
   */
  listProcessedInvoices: adminProtectedProcedure
    .input(
      z.object({
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        userId: z.string().optional(),
        kind: z.enum(["analysis", "chat", "subscription"]).optional(),
      }),
    )
    .query(({ input }) => adminService.listProcessedInvoices(input)),

  /**
   * In-panel confirm. Equivalent to running
   * npx tsx scripts/credit-by-ref.ts <ref> but inside the tRPC surface.
   * Idempotency: server throws if claim.creditConfirmed already true;
   * client disables the button after first click to prevent double-tap.
   */
  confirmCardClaim: adminProtectedProcedure
    .input(z.object({ claimId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await adminService.confirmCardClaim(
          ctx.adminSession!.telegramId,
          input.claimId,
        );
      } catch (e: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e?.message ?? "Confirm failed",
        });
      }
    }),

  /**
   * In-panel cancel. Marks claim closed + writes a
   * `cancelCardClaim` AdminGrant row carrying the reason. Doesn't drop
   * the row (audit history preserved for the user).
   */
  cancelCardClaim: adminProtectedProcedure
    .input(
      z.object({
        claimId: z.string().min(1),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await adminService.cancelCardClaim(
          ctx.adminSession!.telegramId,
          input.claimId,
          input.reason,
        );
      } catch (e: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e?.message ?? "Cancel failed",
        });
      }
    }),

  /**
   * Dashboard aggregate counts. Single round-trip (Promise.all).
   */
  dashStats: adminProtectedProcedure.query(() => adminService.dashStats()),
});
