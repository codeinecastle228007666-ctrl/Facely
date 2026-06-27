import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { pushService } from "@/server/services/pushService";
import { ritualService } from "@/server/services/ritualService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 2026-06-27 — single endpoint now drives two distinct sweeps:
    //   1. Inactivity reminder for users with no analyses in 7+ days
    //      (unchanged — "🌿 Напоминание" copy).
    //   2. Streak-break sweep via ritualService.breakMissedStreaks:
    //      catches users with streak > 0 who missed ≥36h, either
    //      consumes a streakFreeze or resets streak to 0, with a push.
    // Both run from the same cron-job.org daily ping so we don't need
    // an additional scheduled endpoint.

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const inactiveUsers = await prisma.user.findMany({
      where: {
        analyses: {
          none: { createdAt: { gte: cutoff } },
        },
        subscription: null,
      },
      select: { telegramId: true, name: true },
      take: 50,
    });

    const sent: string[] = [];
    for (const u of inactiveUsers) {
      const res = await pushService.sendInactivityReminder(u.telegramId);
      if (res.success) sent.push(u.telegramId);
    }

    const streakResult = await ritualService.breakMissedStreaks();

    return NextResponse.json({
      ok: true,
      reminded: sent.length,
      total: inactiveUsers.length,
      streakBroken: streakResult.brokenCount,
      streakSaved: streakResult.savedCount,
    });
  } catch (e: any) {
    console.error("[Remind] Error:", e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
