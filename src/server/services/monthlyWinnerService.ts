/**
 * 2026-06-28 — Monthly Top-1 leaderboard payout service.
 *
 * Drives `/api/cron/grant-monthly-winner` (cron-job.org fires on 1st @ 01:00 UTC
 * → processes the just-closed calendar month). Ranks User.referralCount
 * (only "referrers" pays out today; the category column exists so we can
 * light up "streaks" / "level" later without a migration).
 *
 * Idempotency contract:
 *   - UNIQUE on `MonthlyWinner.(month, category)` ensures cron-job.org
 *     retries on transient failures can't double-credit (second attempt
 *     either no-ops at the DB layer or returns `{ skipped: true }` from
 *     the explicit pre-check).
 *   - Vercel cold-start mid-flight: even if two lambdas race, the first
 *     to commit the UNIQUE row wins; the loser's INSERT throws P2002 → we
 *     swallow and report skipped.
 *   - Operator manually re-runs the route: same code path, same outcome.
 *
 * Payout math:
 *   - grants `paidAnalyses += payout` (5 = pack5-equivalent in
 *     `lib/pricing.ts`) and bumps XP via the same `XP_PER_PURCHASE * 2`
 *     used for subscription purchase — matches the existing /buy path so
 *     level recalculation is consistent across incentive sources.
 *   - writes an `AdminGrant` row with `adminTelegramId = "system"` for
 *     audit consistency. The kind field follows the existing enum:
 *     "paidAnalyses" + reason carrying the month key so admins can grep
 *     "why does this user suddenly have +5 paidAnalyses".
 *
 * Tied winners / empty months → returns `null` from processMonth — no
 * payout, no rollback, no row. The caller (route.ts) reports the skip.
 */
import { prisma } from "../db";
import { calculateLevel, XP_PER_PURCHASE } from "../utils/levelSystem";

export type WinnerCategory = "referrers" | "streaks" | "level";

const SYSTEM_ADMIN_ID = "system";
const PAYOUT_ANALYSES = 5;

export interface PayoutResult {
  ok: true;
  /** What just happened (or why nothing happened). */
  outcome: "granted" | "already_granted" | "no_winner" | "tied";
  month: string;
  category: WinnerCategory;
  /** Telegram id of the user that owns the row now (or null on no-winner). */
  telegramId: string | null;
  payoutPaidAnalyses: number;
  metricValue: number;
}

function previousMonthUtc(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0..11
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const monthlyWinnerService = {
  /** UTC "YYYY-MM" for the month that just ended (default = current time). */
  previousMonthUtc,

  /**
   * Pick the #1 user for `category` within `month` and credit them.
   * Returns `{ outcome: "no_winner" }` (no payout) if no qualifying user
   * / tied / already granted.
   *
   * SAFETY: every code path that mutates DB is inside the `try` block;
   * we explicitly handle P2002 ("already_granted") and never throw on
   * a contention race — caller can retry with confidence.
   */
  async processMonth(
    month: string,
    category: WinnerCategory = "referrers",
  ): Promise<PayoutResult | null> {
    if (category !== "referrers") {
      // Streaks/level winners not wired yet — return shape stable for
      // future activation; this guard makes cron-job.org healthchecks
      // surface a clear "not yet" rather than silently payout.
      console.log(`[monthlyWinner] category=${category} not enabled; skipping`);
      return {
        ok: true,
        outcome: "no_winner",
        month,
        category,
        telegramId: null,
        payoutPaidAnalyses: 0,
        metricValue: 0,
      };
    }

    // Idempotency guard #1: explicit pre-check. Cheap; flattens the common
    // case (cron retry on already-processed month) to a single SELECT.
    const existing = await prisma.monthlyWinner.findUnique({
      where: { month_category: { month, category } },
      include: { user: { select: { telegramId: true, id: true } } },
    });
    if (existing) {
      return {
        ok: true,
        outcome: "already_granted",
        month,
        category,
        telegramId: existing.user.telegramId,
        payoutPaidAnalyses: existing.payout,
        metricValue: existing.metricValue,
      };
    }

    // Pick the winner. All-time referralCount ranking — already maintained
    // atomically by `referralService.claimReferralBonus`. Tiebreaker: user
    // id ASC (deterministic).
    const candidates = await prisma.user.findMany({
      where: { referralCount: { gt: 0 } },
      orderBy: [{ referralCount: "desc" }, { id: "asc" }],
      take: 2,
      select: { id: true, telegramId: true, name: true, referralCount: true },
    });
    if (candidates.length === 0) {
      console.log(`[monthlyWinner] ${month}/${category}: no qualifying user`);
      return {
        ok: true,
        outcome: "no_winner",
        month,
        category,
        telegramId: null,
        payoutPaidAnalyses: 0,
        metricValue: 0,
      };
    }
    const [first, second] = candidates;
    if (second && second.referralCount === first.referralCount) {
      // Head-to-head tie at top-1 — skip payout to keep behavior
      // predictable. (MVP limitation; admin can manually award.)
      console.log(
        `[monthlyWinner] ${month}/${category}: TIE at ${first.referralCount} ` +
        `(${first.id} & ${second.id}); skipping payout`,
      );
      return {
        ok: true,
        outcome: "tied",
        month,
        category,
        telegramId: first.telegramId,
        payoutPaidAnalyses: 0,
        metricValue: first.referralCount,
      };
    }

    const winner = first;

    // Single atomic block: insert ledger row + increment balance + log
    // admin grant. If the ledger insert races (P2002), swallow — we're
    // already handled by a parallel invocation.
    try {
      await prisma.$transaction(async (tx) => {
        const existingRaceWinner = await tx.monthlyWinner.findUnique({
          where: { month_category: { month, category } },
        });
        if (existingRaceWinner) {
          throw new RaceDetected();
        }
        await tx.monthlyWinner.create({
          data: {
            month,
            category,
            userId: winner.id,
            payout: PAYOUT_ANALYSES,
            metricValue: winner.referralCount,
          },
        });
        const userRow = await tx.user.findUniqueOrThrow({
          where: { id: winner.id },
          select: { xp: true, paidAnalyses: true },
        });
        const xpGain = XP_PER_PURCHASE * 2;
        const nextXp = userRow.xp + xpGain;
        await tx.user.update({
          where: { id: winner.id },
          data: {
            paidAnalyses: { increment: PAYOUT_ANALYSES },
            xp: nextXp,
            level: calculateLevel(nextXp),
          },
        });
        await tx.adminGrant.create({
          data: {
            adminTelegramId: SYSTEM_ADMIN_ID,
            targetUserId: winner.id,
            kind: "paidAnalyses",
            amount: PAYOUT_ANALYSES,
            reason: `monthly_winner:${month}:${category}`,
            details: {
              from: userRow.paidAnalyses,
              to: userRow.paidAnalyses + PAYOUT_ANALYSES,
              metric: "referralCount",
              metricValue: winner.referralCount,
            },
          },
        });
      });
    } catch (e) {
      if (e instanceof RaceDetected) {
        return {
          ok: true,
          outcome: "already_granted",
          month,
          category,
          telegramId: winner.telegramId,
          payoutPaidAnalyses: PAYOUT_ANALYSES,
          metricValue: winner.referralCount,
        };
      }
      throw e;
    }

    console.log(
      `[monthlyWinner] ${month}/${category}: GRANTED +${PAYOUT_ANALYSES} ` +
      `paidAnalyses to userId=${winner.id} (telegramId=${winner.telegramId}, ` +
      `referralCount=${winner.referralCount})`,
    );
    return {
      ok: true,
      outcome: "granted",
      month,
      category,
      telegramId: winner.telegramId,
      payoutPaidAnalyses: PAYOUT_ANALYSES,
      metricValue: winner.referralCount,
    };
  },
};

/**
 * Internal sentinel thrown inside the transaction to abort cleanly when
 * the ledger row already exists (race against a parallel invocation).
 * Class-based so `instanceof` survives the Prisma transaction error
 * boundary (raw error subclasses get re-wrapped to a generic Prisma
 * ClientError — instanceof would fail).
 */
class RaceDetected extends Error {
  constructor() {
    super("race_detected");
    this.name = "RaceDetected";
  }
}
