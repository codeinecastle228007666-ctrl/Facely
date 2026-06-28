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

    // 2026-06-28 — month-window count from the Referral table (NOT the
    // all-time `User.referralCount` scalar). Audit finding: prior ranking
    // was monotonically non-decreasing, so the same top-1 retained the
    // win forever — defeating the "1st of next month = different winner"
    // promise on the /rating page. Now restricted to `createdAt` in the
    // [monthStart, monthEnd) half-open interval so each closing month
    // actually crowns whoever invited the most during that month.
    const monthWindow = monthWindowUtc(month);
    if (!monthWindow) {
      console.error(`[monthlyWinner] malformed month "${month}"; skipping`);
      return {
        ok: true, outcome: "no_winner", month, category,
        telegramId: null, payoutPaidAnalyses: 0, metricValue: 0,
      };
    }
    const { startUtc, endUtc } = monthWindow;

    // groupBy top-2 inside the month window so we can detect ties
    // without a separate count query.
    const grouped = await prisma.referral.groupBy({
      by: ["referrerId"],
      where: { createdAt: { gte: startUtc, lt: endUtc } },
      _count: { referrerId: true },
      orderBy: { _count: { referrerId: "desc" } },
      take: 2,
    });

    if (grouped.length === 0) {
      console.log(`[monthlyWinner] ${month}/${category}: no referrals in window`);
      return {
        ok: true, outcome: "no_winner", month, category,
        telegramId: null, payoutPaidAnalyses: 0, metricValue: 0,
      };
    }

    // groupBy doesn't auto-join the FK target — resolve telegramIds
    // separately. Bounded by `take: 2` so this is O(1).
    const refIds = grouped.map((g) => g.referrerId);
    const refUsers = await prisma.user.findMany({
      where: { id: { in: refIds } },
      select: { id: true, telegramId: true },
    });
    const tgtById = new Map(refUsers.map((u) => [u.id, u]));

    // Tie-break determinism: same `count` → lower referrerId wins the
    // tied slot. Stable across re-runs so cron retries don't pick
    // different winners on race.
    const orderedCandidates = grouped
      .map((g) => ({
        id: g.referrerId,
        telegramId: tgtById.get(g.referrerId)?.telegramId ?? "",
        count: g._count.referrerId,
      }))
      .sort((a, b) =>
        b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );

    const [first, second] = orderedCandidates;
    if (second && second.count === first.count) {
      console.log(
        `[monthlyWinner] ${month}/${category}: TIE at ${first.count} ` +
        `(${first.id} & ${second.id}); skipping payout`,
      );
      return {
        ok: true, outcome: "tied", month, category,
        telegramId: first.telegramId, payoutPaidAnalyses: 0,
        metricValue: first.count,
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
          metricValue: winner.count,
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
          // 2026-06-28 — `metric: "monthly_referrals"` aligns with the
          // new month-window count so admins reading the audit row
          // see the same number that the winner saw on the /rating
          // banner (was all-time, which was misleading).
          metric: "monthly_referrals",
          metricValue: winner.count,
            },
          },
        });
      });
    } catch (e: any) {
      // 2026-06-28 — accept both the custom `RaceDetected` sentinel
      // (lexical collision from in-tx re-check) AND Prisma's native
      // P2002 (DB-layer UNIQUE collision when two Vercel lambdas pass
      // the re-check simultaneously before either commits). Either
      // path returns the idempotent response so cron-job.org never
      // sees a 500 from a benign race.
      if (e instanceof RaceDetected || e?.code === "P2002") {
        return {
          ok: true, outcome: "already_granted",
          month, category,
          telegramId: winner.telegramId,
          payoutPaidAnalyses: PAYOUT_ANALYSES,
          metricValue: winner.count,
        };
      }
      throw e;
    }

    console.log(
      `[monthlyWinner] ${month}/${category}: GRANTED +${PAYOUT_ANALYSES} ` +
      `paidAnalyses to userId=${winner.id} (telegramId=${winner.telegramId}, ` +
      `monthlyReferralCount=${winner.count})`,
    );
    return {
      ok: true,
      outcome: "granted",
      month,
      category,
      telegramId: winner.telegramId,
      payoutPaidAnalyses: PAYOUT_ANALYSES,
      metricValue: winner.count,
    };
  },
};

/**
 * 2026-06-28 — Internal helper to convert `"YYYY-MM"` into a UTC
 * `[start, end)` interval. Returns null on unparseable input so the
 * caller can short-circuit with `no_winner`. Using half-open semantics
 * (`gte startUtc, lt endUtc`) matches Prisma's expectation and avoids
 * the classic off-by-one bug that's easy to introduce with month-edge
 * anchors.
 */
function monthWindowUtc(
  month: string,
): { startUtc: Date; endUtc: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) {
    return null;
  }
  return {
    startUtc: new Date(Date.UTC(yy, mm - 1, 1)),
    endUtc: new Date(Date.UTC(yy, mm, 1)),
  };
}

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
