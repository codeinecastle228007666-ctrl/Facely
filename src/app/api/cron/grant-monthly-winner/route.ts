/**
 * 2026-06-28 — Monthly leaderboard payout driver. Hit by cron-job.org
 * on 1st @ 01:00 UTC → processes the just-closed calendar month.
 *
 * Endpoint contract:
 *   - GET /api/cron/grant-monthly-winner
 *   - No auth (cron-job.org server-side pings; protected only by URL
 *     secrecy — same posture as `/api/remind` and `/api/health`).
 *   - Response: JSON { ok, month, category, outcome, telegramId?,
 *     payoutPaidAnalyses?, metricValue? } so cron-job.org logs surface
 *     the result for monitoring without us having to ship separate
 *     monitoring.
 *
 * The cron-job schedule lives outside the repo at cron-job.org — see
 * the project AGENTS.md for the link to register:
 *     https://cron-job.org → schedules "0 1 1 * *" → GET this URL.
 */
import { NextResponse } from "next/server";
import { monthlyWinnerService } from "@/server/services/monthlyWinnerService";
import { pushService } from "@/server/services/pushService";

export const dynamic = "force-dynamic";

// Russian month names in **genitive case** — required for "1 <месяца>"
// construction. Defined locally because this is the only place we render
// human-readable month names; promoting to a util would add surface area
// for no current consumer.
const RU_MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

/**
 * Russian pluralization for "реферал" — handles the special 11..14
 * "many" case which doesn't follow the simple mod-10 rule. Returns the
 * correct form so the winner's metric reads naturally ("1 реферал" vs
 * "3 реферала" vs "12 рефералов"). Inline-only because there's exactly
 * one call-site; promoting to a util for one consumer is over-engineering.
 */
function pluralRefs(n: number): string {
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "рефералов";
  const m10 = n % 10;
  if (m10 === 1) return "реферал";
  if (m10 >= 2 && m10 <= 4) return "реферала";
  return "рефералов";
}

/**
 * Human-readable label for the NEXT month-start prize draw. Cron
 * fires 1st @ 01:00 UTC (= 04:00 МСК), so calling this at that exact
 * moment gives "1 <следующий месяц> в 04:00 МСК" — copy kept in sync
 * with MonthlyPrizesBanner's "04:00 МСК" footnote on the web.
 *
 * Year-rollover: December → January is handled by `Date.UTC` auto-
 * normalization, but the label intentionally drops the year — "1
 * января в 04:00 МСК" reads the same regardless of which January.
 */
function nextDrawLabelMs(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1));
  return `1 ${RU_MONTHS_GENITIVE[next.getUTCMonth()]} в 04:00 МСК`;
}

export async function GET() {
  try {
    const month = monthlyWinnerService.previousMonthUtc();
    const result = await monthlyWinnerService.processMonth(month, "referrers");
    if (!result) {
      return NextResponse.json(
        { ok: true, month, outcome: "internal_error" },
        { status: 500 },
      );
    }

    // Push notify the winner on a fresh grant. We do NOT push on
    // already_granted / no_winner / tied (those are idempotent or
    // expected outcomes — re-pushing would be noise).
    //
    // Composition: two paragraphs in one Telegram message — paragraph
    // break is `\n\n` (Telegram parses them as a single multi-line
    // bubble; doesn't collapse).
    //   ① What they got:  prize value, account credit, thanks-line.
    //   ② How to defend:  current referralCount, next-draw date in
    //                     MSK (matches MonthlyPrizesBanner copy on
    //                     /rating), encouragement to keep inviting.
    //
    // Keeping `metricValue` and the next-draw date inside the message
    // (instead of just "congrats") so the winner has actionable
    // context — without it the push feels hollow and they're less
    // likely to re-engage before the next cycle.
    if (result.outcome === "granted" && result.telegramId) {
      const refsCount = result.metricValue;
      const refsLabel = pluralRefs(refsCount);
      const nextDraw = nextDrawLabelMs(new Date());
      const text =
        `🏆 Ты — Топ-1 этого месяца в рейтинге рефералов!\n\n` +
        `🎁 В подарок: ${result.payoutPaidAnalyses} анализов ` +
        `(≈ 399 ₽ / 280 ⭐) уже на твоём балансе.\n` +
        `Спасибо, что приглашаешь друзей в Reveli 💜\n\n` +
        `🛡 Защити лидерство в следующем месяце:\n` +
        `• У тебя ${refsCount} ${refsLabel} — 1-е место в рейтинге\n` +
        `• Следующий розыгрыш — ${nextDraw}\n` +
        `• Продолжай приглашать друзей — даже 1 новый реферал может изменить расклад`;
      pushService.send(result.telegramId, "🏆 Топ-1 месяца!", text)
        .catch((e) => console.error(`[monthlyWinner] push failed: ${e?.message ?? e}`));
    }

    return NextResponse.json({
      ok: true,
      month: result.month,
      category: result.category,
      outcome: result.outcome,
      telegramId: result.telegramId,
      payoutPaidAnalyses: result.payoutPaidAnalyses,
      metricValue: result.metricValue,
    });
  } catch (e: any) {
    console.error(`[monthlyWinner] route error: ${e?.message ?? e}`);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
