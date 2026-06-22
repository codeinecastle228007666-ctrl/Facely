import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { pushService } from "@/server/services/pushService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    return NextResponse.json({ ok: true, reminded: sent.length, total: inactiveUsers.length });
  } catch (e: any) {
    console.error("[Remind] Error:", e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
