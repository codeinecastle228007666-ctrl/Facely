import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

const BOT_TOKEN = process.env.BOT_TOKEN || "";

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    let update: any;
    try {
      update = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }

    const payment = update?.message?.successful_payment;
    if (!payment || !payment.invoice_payload) {
      return NextResponse.json({ ok: true });
    }

    const payload: string = payment.invoice_payload;
    const totalAmount = payment.total_amount || 0;
    const currency = payment.currency || "";

    if (currency !== "XTR") {
      console.log(`[Webhook] Non-XTR payment ignored: ${currency}`);
      return NextResponse.json({ ok: true });
    }

    console.log(`[Webhook] Stars payment: payload=${payload}, amount=${totalAmount}`);

    if (payload.startsWith("analysis_")) {
      const parts = payload.split("_");
      const userId = parts.slice(2).join("_");
      const quantity = parseInt(parts[1]) || 1;

      const expectedAmount = quantity * 50;
      if (totalAmount < expectedAmount) {
        console.log(`[Webhook] Amount mismatch: got ${totalAmount}, expected ${expectedAmount}`);
        return NextResponse.json({ ok: true });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        console.log(`[Webhook] User not found: ${userId}`);
        return NextResponse.json({ ok: true });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { paidAnalyses: { increment: quantity } },
      });

      console.log(`[Webhook] Credited ${quantity} analysis(es) to user ${userId}`);
    }

    if (payload.startsWith("chat_")) {
      const parts = payload.split("_");
      const userId = parts.slice(2).join("_");
      const quantity = parseInt(parts[1]) || 10;

      const expectedAmount = quantity;
      if (totalAmount < expectedAmount) {
        console.log(`[Webhook] Amount mismatch for chat: got ${totalAmount}, expected ${expectedAmount}`);
        return NextResponse.json({ ok: true });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        console.log(`[Webhook] User not found for chat: ${userId}`);
        return NextResponse.json({ ok: true });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { freeChatQuestions: { increment: quantity } },
      });

      console.log(`[Webhook] Credited ${quantity} chat questions to user ${userId}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(`[Webhook] Error: ${e.message}`);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
