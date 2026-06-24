import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const STAR_ANALYSIS_PRICE = 1;
const STAR_CHAT_PRICE = 1;

async function telegramRequest(method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getExpectedStarsAmount(payload: string) {
  if (payload.startsWith("analysis_")) {
    const parts = payload.split("_");
    const quantity = parseInt(parts[1], 10) || 1;
    return quantity * STAR_ANALYSIS_PRICE;
  }

  if (payload.startsWith("chat_")) {
    return STAR_CHAT_PRICE;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    let update: any;
    try {
      update = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
    }

    const preCheckoutQuery = update?.pre_checkout_query;
    if (preCheckoutQuery) {
      const payload = preCheckoutQuery.invoice_payload || "";
      const totalAmount = preCheckoutQuery.total_amount || 0;
      const currency = preCheckoutQuery.currency || "";
      const expectedAmount = getExpectedStarsAmount(payload);

      if (currency !== "XTR" || expectedAmount === null || totalAmount !== expectedAmount) {
        const reason =
          currency !== "XTR"
            ? "Unsupported currency"
            : expectedAmount === null
              ? "Unknown invoice payload"
              : "Payment amount mismatch";

        await telegramRequest("answerPreCheckoutQuery", {
          pre_checkout_query_id: preCheckoutQuery.id,
          ok: false,
          error_message: reason,
        });

        return NextResponse.json({ ok: true });
      }

      await telegramRequest("answerPreCheckoutQuery", {
        pre_checkout_query_id: preCheckoutQuery.id,
        ok: true,
      });

      return NextResponse.json({ ok: true });
    }

    const msg = update?.message;
    const payment = msg?.successful_payment;

    if (msg?.text?.startsWith("/start")) {
      const parts = msg.text.split(" ");
      const refCode = parts[1] || "";
      const chatId = msg.chat?.id;
      const firstName = msg.from?.first_name || "";

      const webAppUrl = refCode && /^\d{5,}$/.test(refCode)
        ? `https://facely-chi.vercel.app/?ref=${refCode}`
        : "https://facely-chi.vercel.app";

      let replyText = `Привет, ${firstName}! 👋\n\nДобро пожаловать в Reveli — AI-анализ кожи лица.`;
      if (refCode && /^\d{5,}$/.test(refCode)) {
        replyText = `Привет, ${firstName}! 👋\n\nТебя пригласили в Reveli! 🎁\nПосле регистрации ты получишь +1 бесплатный анализ.`;
      }

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          reply_markup: {
            inline_keyboard: [[{ text: "🚀 Открыть Reveli", web_app: { url: webAppUrl } }]],
          },
        }),
      });

      return NextResponse.json({ ok: true });
    }

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

      const expectedAmount = quantity * STAR_ANALYSIS_PRICE;
      if (totalAmount !== expectedAmount) {
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

      const expectedAmount = STAR_CHAT_PRICE;
      if (totalAmount !== expectedAmount) {
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
