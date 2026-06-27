import { prisma } from "../db";
import { calculateLevel } from "../utils/levelSystem";
import { pushService } from "./pushService";
import { subscriptionService } from "./subscriptionService";
import type { Prisma } from "@prisma/client";

/**
 * 2026-06-26 — /admin panel backend. All admin-driven mutations
 * (compensations, manual refunds, marketing rewards, manual fixes)
 * funnel through this service so we get:
 *   1. A single audit row in `AdminGrant` per action.
 *   2. A best-effort Telegram push to the user with friendly copy.
 *   3. Atomic inc/dec via Prisma `increment` operations (= safe under
 *      concurrent admins).
 *
 * NOT inside this service: bulk operations, refund flows, or anything
 * that needs transactional guarantees across multiple tables — those
 * should go via tRPC middlewares or transaction() blocks added later.
 */

export type AdminGrantKind =
  | "paidAnalyses"
  | "freeChatQuestions"
  | "streakFreeze"
  | "subscriptionDays"
  | "proTrialDays"
  | "xp";

export interface AdminGrantInput {
  targetUserId: string;
  kind: AdminGrantKind;
  /** Positive integer 1..10000 (zod-clamped at the router layer). */
  amount: number;
  reason?: string;
}

export const KIND_LABEL: Record<AdminGrantKind, string> = {
  paidAnalyses: "Платных анализов",
  freeChatQuestions: "Вопросов чата",
  streakFreeze: "Streak freezes",
  subscriptionDays: "Дней подписки",
  proTrialDays: "Дней Pro-trial",
  xp: "XP",
};

/** User-facing notification message for each grant kind. */
function notifyText(kind: AdminGrantKind, amount: number): string {
  switch (kind) {
    case "paidAnalyses":
      return `🎁 Бонус от команды Reveli!\nТебе зачислено ${amount} анализ(ов) кожи — пользуйся!`;
    case "freeChatQuestions":
      return `🎁 Бонус от команды Reveli!\nТебе зачислено ${amount} вопрос(ов) для AI-косметолога.`;
    case "streakFreeze":
      return `🎁 Бонус: тебе начислено ${amount} streak freeze(ов).\nИми можно «заморозить» пропущенный день ритуала ухода.`;
    case "subscriptionDays":
      return `🎁 Подписка продлена на ${amount} дней!\nБезлимитный доступ к анализам активирован.`;
    case "proTrialDays":
      return `🎁 Тебе выдан Pro-trial на ${amount} дней!\nПопробуй безлимит без оплаты.`;
    case "xp":
      return `🎁 Бонус +${amount} XP! Спасибо, что ты с нами.`;
  }
}

/**
 * Add `days` to a Date — UTC-safe (avoids DST pitfalls that
 * `setDate(date+1)` would introduce near midnight in some zones).
 */
function addDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export const adminService = {
  /**
   * Search users by telegramId prefix OR @username substring OR name
   * substring. Returns a compact summary suitable for the search list.
   * Sorted by `paidAnalyses DESC, createdAt DESC` so paying users
   * surface first.
   */
  async searchUsers(query: string, limit = 15) {
    const q = query.trim();
    if (!q) return [];
    return prisma.user.findMany({
      where: {
        OR: [
          { telegramId: { contains: q } },
          { username: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ paidAnalyses: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        telegramId: true,
        name: true,
        username: true,
        paidAnalyses: true,
        level: true,
        subscriptionEnd: true,
      },
    });
  },

  /** Full user card for the selected-user panel (incl. subscription + rituals). */
  async getUserDetails(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true, rituals: true },
    });
  },

  /**
   * Apply one grant. Sequence:
   *   1. Look up target user (404 if missing).
   *   2. Apply mutation (increment / upsert / update) — atomic via
   *      Prisma's `increment` operator.
   *   3. Write audit row capturing before/after values.
   *   4. Send best-effort Telegram push (failure logged, not fatal).
   *
   * Each kind has its own branch because the DB shape is unique — we
   * don't try to coerce all 6 kinds into a single generic path and
   * lose semantics (Subscription vs User.subscriptionEnd churn).
   */
  async grant(adminTelegramId: string, input: AdminGrantInput) {
    const target = await prisma.user.findUnique({
      where: { id: input.targetUserId },
    });
    if (!target) throw new Error("Target user not found");

    let details: Record<string, unknown> = {};
    const now = new Date();

    switch (input.kind) {
      case "paidAnalyses": {
        const from = target.paidAnalyses;
        const to = from + input.amount;
        await prisma.user.update({
          where: { id: target.id },
          data: { paidAnalyses: { increment: input.amount } },
        });
        details = { from, to };
        break;
      }
      case "freeChatQuestions": {
        const from = target.freeChatQuestions;
        const to = from + input.amount;
        await prisma.user.update({
          where: { id: target.id },
          data: { freeChatQuestions: { increment: input.amount } },
        });
        details = { from, to };
        break;
      }
      case "streakFreeze": {
        const from = target.streakFreezes;
        const to = from + input.amount;
        await prisma.user.update({
          where: { id: target.id },
          data: { streakFreezes: { increment: input.amount } },
        });
        details = { from, to };
        break;
      }
      case "subscriptionDays": {
        // "Extend" semantics: take max(now, current) + N days. Never
        // reset to now (admin should never accidentally shorten).
        const currentSub = await prisma.subscription.findUnique({
          where: { userId: target.id },
        });
        const baseEnd =
          currentSub?.endDate && currentSub.endDate > now
            ? currentSub.endDate
            : now;
        const newEnd = addDays(baseEnd, input.amount);
        await prisma.subscription.upsert({
          where: { userId: target.id },
          create: {
            userId: target.id,
            status: "active",
            type: "paid",
            startDate: now,
            endDate: newEnd,
          },
          update: { status: "active", type: "paid", endDate: newEnd },
        });
        // Mirror subscriptionEnd on User for client convenience (some
        // components read User.subscriptionEnd instead of joining).
        await prisma.user.update({
          where: { id: target.id },
          data: { subscriptionEnd: newEnd },
        });
        details = { until: newEnd.toISOString(), extendedBy: input.amount };
        break;
      }
      case "proTrialDays": {
        const current = target.proTrialUntil;
        const base = current && current > now ? current : now;
        const newUntil = addDays(base, input.amount);
        await prisma.user.update({
          where: { id: target.id },
          data: { proTrialUntil: newUntil },
        });
        details = { until: newUntil.toISOString(), extendedBy: input.amount };
        break;
      }
      case "xp": {
        const from = target.xp;
        const newXp = from + input.amount;
        const newLevel = calculateLevel(newXp);
        await prisma.user.update({
          where: { id: target.id },
          data: { xp: newXp, level: newLevel },
        });
        details = { from, to: newXp, level: newLevel };
        break;
      }
    }

    const grant = await prisma.adminGrant.create({
      data: {
        adminTelegramId,
        targetUserId: target.id,
        kind: input.kind,
        amount: input.amount,
        reason: input.reason?.trim() || null,
        // Prisma Json field accepts plain object literal as InputJsonValue.
        details: details as Prisma.InputJsonValue,
      },
    });

    // Best-effort Telegram push. We never bubble a push failure —
    // admin's job is already done at this point (DB + audit persisted).
    try {
      await pushService.send(
        target.telegramId,
        "Бонус от Reveli",
        notifyText(input.kind, input.amount),
      );
    } catch (e: any) {
      console.warn(
        `[admin] push to ${target.telegramId} failed: ${e?.message ?? e}`,
      );
    }

    return {
      grant,
      target: { id: target.id, telegramId: target.telegramId, name: target.name },
      kindLabel: KIND_LABEL[input.kind],
    };
  },

  /**
   * Most-recent N grants globally — drives the audit-log feed on
   * /admin. Includes minimal target user info so the panel can
   * render "who got what" without an extra round-trip.
   */
  async listRecentGrants(limit = 30) {
    return prisma.adminGrant.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      include: {
        target: {
          select: { id: true, telegramId: true, name: true, username: true },
        },
      },
    });
  },

  // ─── 2026-06-26 — Phase 2: full admin surface ────────────────────────
  // Browse-all users, list all payments (Stars auto + bank transfer),
  // and in-panel confirm/cancel for CardTransferClaims. Each method is
  // kept narrow so its matching tRPC procedure exports a tiny zod input.

  /**
   * Paginated browse of ALL users (no search filter). Sorted by paying
   // first (paidAnalyses DESC), then most recently registered.
   */
  async listUsers({
    offset = 0,
    limit = 20,
  }: {
    offset?: number;
    limit?: number;
  }) {
    return prisma.user.findMany({
      orderBy: [{ paidAnalyses: "desc" }, { createdAt: "desc" }],
      skip: Math.max(0, offset),
      take: Math.min(Math.max(1, limit), 100),
      select: {
        id: true,
        telegramId: true,
        name: true,
        username: true,
        paidAnalyses: true,
        level: true,
        subscriptionEnd: true,
        createdAt: true,
      },
    });
  },

  /**
   * CardTransferClaim feed. Status taxonomy:
   *   - "pending"   → notificationSentAt != null && !creditConfirmed
   *                   (user clicked "I paid", admin was notified, awaiting confirm)
   *   - "drafts"    → notificationSentAt IS NULL (modal opened, no submit yet)
   *   - "confirmed" → creditConfirmed = true (admin credited OR cancelled)
   *   - "all"       → every row, newest first
   *
   * Sorted newest-first. Cap 100/page to keep Vercel function fast.
   */
  async listCardClaims({
    limit = 30,
    offset = 0,
    status = "pending",
  }: {
    limit?: number;
    offset?: number;
    status?: "pending" | "drafts" | "confirmed" | "all";
  }) {
    const where: Prisma.CardTransferClaimWhereInput = {};
    if (status === "pending") {
      where.creditConfirmed = false;
      where.notificationSentAt = { not: null };
    } else if (status === "drafts") {
      where.notificationSentAt = null;
    } else if (status === "confirmed") {
      where.creditConfirmed = true;
    }
    return prisma.cardTransferClaim.findMany({
      where,
      orderBy: { claimedAt: "desc" },
      skip: Math.max(0, offset),
      take: Math.min(Math.max(1, limit), 100),
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            name: true,
            username: true,
          },
        },
      },
    });
  },

  /**
   * ProcessedInvoice feed (Stars auto-credits). Filterable by user or
   * kind. No user join in Prisma (no FK relation in schema) — the
   * client joins by userId when it has a list of users to map.
   */
  async listProcessedInvoices({
    limit = 30,
    offset = 0,
    userId,
    kind,
  }: {
    limit?: number;
    offset?: number;
    userId?: string;
    kind?: "analysis" | "chat" | "subscription";
  }) {
    const where: Prisma.ProcessedInvoiceWhereInput = {};
    if (userId) where.userId = userId;
    if (kind) where.kind = kind;
    return prisma.processedInvoice.findMany({
      where,
      orderBy: { processedAt: "desc" },
      skip: Math.max(0, offset),
      take: Math.min(Math.max(1, limit), 100),
    });
  },

  /**
   * In-panel confirm for a CardTransferClaim. Equivalent to running
   * scripts/credit-by-ref.ts but exposed as tRPC mutation so admin never
   * has to ssh into Vercel. Calls subscriptionService to apply the
   * purchase, then marks the claim confirmed + writes a creditCardClaim
   // AdminGrant audit row so the unified audit feed shows "card claim
   * confirmed by admin X".
   *
   * Idempotency: claim.creditConfirmed already true → throws. Caller
   * should refresh list. The endpoint also disables the Confirm button
   * on the first click (client-side) to prevent accidental double-tap.
   */
  async confirmCardClaim(adminTelegramId: string, claimId: string) {
    const claim = await prisma.cardTransferClaim.findUnique({
      where: { id: claimId },
      include: { user: true },
    });
    if (!claim) throw new Error("Claim not found");
    if (claim.creditConfirmed) throw new Error("Claim already closed");

    const tier = claim.tier as "single" | "pack5" | "monthly" | "fifteen";
    const qty =
      tier === "single" ? 1 : tier === "pack5" ? 5 : tier === "fifteen" ? 15 : 0;

    if (tier === "monthly") {
      await subscriptionService.activate(claim.userId, "paid");
    } else if (qty > 0) {
      await subscriptionService.purchaseAnalysis(claim.userId, qty);
    } else {
      throw new Error(`Unknown tier: ${tier}`);
    }

    const confirmedAt = new Date();
    await prisma.cardTransferClaim.update({
      where: { id: claim.id },
      data: { creditConfirmed: true, creditConfirmedAt: confirmedAt },
    });
    await prisma.adminGrant.create({
      data: {
        adminTelegramId,
        targetUserId: claim.userId,
        kind: "creditCardClaim",
        amount: claim.amount,
        reason: `card-transfer ref=${claim.expectedReference} tier=${tier}`,
        details: {
          from: "cardClaim",
          ref: claim.expectedReference,
          tier,
          amount: claim.amount,
        } as Prisma.InputJsonValue,
      },
    });

    // Best-effort push. Failure doesn't fail the operation (DB + audit
    // already persisted) — admin would re-push manually if needed.
    try {
      await pushService.send(
        claim.user.telegramId,
        "Оплата подтверждена",
        `🎉 Спасибо за покупку!\n${
          tier === "monthly"
            ? "Подписка активирована — пользуйся!"
            : `Зачислено ${qty} анализ(ов) — пользуйся!`
        }`,
      );
    } catch (e: any) {
      console.warn(`[admin] confirm push failed: ${e?.message ?? e}`);
    }

    return {
      claim: { id: claim.id, expectedReference: claim.expectedReference },
      target: {
        id: claim.userId,
        telegramId: claim.user.telegramId,
        name: claim.user.name,
      },
      tier,
      confirmedAt: confirmedAt.toISOString(),
    };
  },

  /**
   * In-panel cancel for a CardTransferClaim. Doesn't drop the row —
   * we'd lose user-side audit history. Marks it "closed-via-cancel"
   // (creditConfirmed=true) + writes a cancelCardClaim AdminGrant row
   // that captures the reason. The audit feed shows both events.
   *
   * Phase 3 (later): add explicit `cancelledAt` / `cancellationReason`
   // fields to CardTransferClaim via migration. For now we reuse
   // `creditConfirmed` as a "closed" flag with audit-only distinction.
   */
  async cancelCardClaim(
    adminTelegramId: string,
    claimId: string,
    reason?: string,
  ) {
    const claim = await prisma.cardTransferClaim.findUnique({
      where: { id: claimId },
    });
    if (!claim) throw new Error("Claim not found");
    if (claim.creditConfirmed) throw new Error("Claim already closed");

    await prisma.cardTransferClaim.update({
      where: { id: claim.id },
      data: { creditConfirmed: true, creditConfirmedAt: new Date() },
    });
    await prisma.adminGrant.create({
      data: {
        adminTelegramId,
        targetUserId: claim.userId,
        kind: "cancelCardClaim",
        amount: 0,
        reason:
          reason?.trim() ||
          `cancel card-claim ref=${claim.expectedReference}`,
      },
    });
    return { ok: true };
  },

  /**
   * Aggregate dashboard counts. Single round-trip with Promise.all so
   * all six counts run in parallel (cheap: each is a single SQL COUNT).
   */
  async dashStats() {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [
      totalUsers,
      payingUsers,
      pendingClaims,
      confirmedClaims,
      starsInvoices,
      grantsLast7d,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { paidAnalyses: { gt: 0 } } }),
      prisma.cardTransferClaim.count({
        where: { creditConfirmed: false, notificationSentAt: { not: null } },
      }),
      prisma.cardTransferClaim.count({ where: { creditConfirmed: true } }),
      prisma.processedInvoice.count(),
      prisma.adminGrant.count({
        where: { createdAt: { gte: weekAgo } },
      }),
    ]);
    return {
      totalUsers,
      payingUsers,
      pendingClaims,
      confirmedClaims,
      starsInvoices,
      grantsLast7d,
    };
  },
};
