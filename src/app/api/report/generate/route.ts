import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { reportService } from "@/server/services/reportService";

export const dynamic = "force-dynamic";

// 2026-06-28 — Chunked parallelized weekly reports.
//
// Previous behaviour: pick up to 20 users with analyses this week,
// generate a Groq-powered summary per user, all sequential in a single
// Lambda. Each Groq call takes 2-8s. So 20 users × 5s avg = 100s —
// hard-busted the Vercel Hobby 10s timeout, returning 504 four times
// out of five. Reports simply never landed for the 75% of the base
// that wasn't early in the loop.
//
// New behaviour:
//   * `?limit=N&offset=M` query params (defaults limit=3, offset=0).
//     Cron-job.org can chain N+3, then N+6, then ... with separate
//     fires — the whole base gets covered with N/3 lambda invocations.
//   * `Promise.allSettled` per-batch instead of serial loop. 3 Groq
//     HTTP calls run in parallel → 2-3s wall instead of 6-9s. Prisma
//     queries serialize on our `connection_limit=1` pooler, but the
//     HTTP leg dominates wall-time, so parallel HTTP + serialized SQL
//     still ends up faster overall.
//   * On Cold-start path: 3 users max → 9s upper bound fits the 10s
//     limit with margin for the Prisma connection handshake.
//
// Idempotency: pre-filter on `alreadySet` (above) drops users who
// already have a Report this week BEFORE any Groq call. Retry by
// cron-job.org (or a duplicate chain fire) is safe — it just sees
// `skipped: N>0` in the response.
const DEFAULT_BATCH_SIZE = 3;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));
    const limit = Math.max(1, Math.min(10, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_BATCH_SIZE), 10)));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);

    // Pull (offset, offset+limit) eligible users: anyone who had an
    // analysis this week AND doesn't already have a generated report
    // this week. Ordered by createdAt so the chain across batches is
    // deterministic.
    const eligible = await prisma.user.findMany({
      where: {
        analyses: {
          some: { createdAt: { gte: sevenDaysAgo } },
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
      skip: offset,
      take: limit,
    });

    // Pre-filter out users who already have a report this week. We
    // batch the findFirst query: cheaper than one roundtrip per user,
    // and catches the case where a previous chain-batch already did
    // user N before our service short-circuited inside it.
    const alreadyGenerated = await prisma.report.findMany({
      where: {
        userId: { in: eligible.map((u) => u.id) },
        generatedAt: { gte: startOfWeek },
      },
      select: { userId: true },
    });
    const alreadySet = new Set(alreadyGenerated.map((r) => r.userId));
    const work = eligible.filter((u) => !alreadySet.has(u.id));

    // Parallel generation. allSettled so one user's fail doesn't abort
    // the whole batch — orphaned posts still ship.
    const results = await Promise.allSettled(
      work.map((user) => reportService.generateWeeklyReport(user.id)),
    );

    let generated = 0;
    const failures: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value) {
        generated++;
      } else if (r.status === "rejected") {
        const uid = work[i]?.id ?? "?";
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`[report] Failed for user ${uid}:`, msg);
        failures.push(uid);
      }
    }

    const totalChecked = eligible.length;
    const nextOffset = offset + limit;

    return NextResponse.json({
      ok: true,
      generated,
      totalChecked,
      skipped: alreadySet.size,
      failed: failures,
      offset,
      limit,
      hasMore: totalChecked === limit,
      nextOffset: totalChecked === limit ? nextOffset : null,
    });
  } catch (e: any) {
    console.error("[report] Error:", e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
