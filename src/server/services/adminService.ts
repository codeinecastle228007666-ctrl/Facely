import { prisma } from "../db";
import { calculateLevel } from "../utils/levelSystem";
import { pushService } from "./pushService";
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
};
