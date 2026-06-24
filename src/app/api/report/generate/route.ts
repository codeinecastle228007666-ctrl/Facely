import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { reportService } from "@/server/services/reportService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const users = await prisma.user.findMany({
      where: {
        analyses: {
          some: { createdAt: { gte: sevenDaysAgo } },
        },
      },
      select: { id: true },
      take: 20,
    });

    const generated: string[] = [];
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);

    for (const user of users) {
      try {
        const existingReport = await prisma.report.findFirst({
          where: {
            userId: user.id,
            generatedAt: { gte: startOfWeek },
          },
        });

        if (existingReport) continue;

        const report = await reportService.generateWeeklyReport(user.id);
        if (report) generated.push(user.id);
      } catch (e) {
        console.error(`[report] Failed for user ${user.id}:`, e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ ok: true, generated: generated.length, total: users.length });
  } catch (e: any) {
    console.error("[report] Error:", e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
