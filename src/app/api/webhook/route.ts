import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { PRICES, CHAT_PRICE } from "@/lib/pricing";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://facely-chi.vercel.app";

async function telegramRequest(method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Returns the expected invoice amount for a given invoice payload,
 * using the SAME pricing matrix that `subscriptionService.createStarsInvoice`
 * uses to bill the user. If no tier matches the quantity, returns null so
 * Telegram rejects the payment (better than crediting wrong amount).
 *
 *      payload         kind        expected amount (XTR stars)
 *      analysis_1_xxx  analysis    PRICES.XTR.single (80)
 *      analysis_5_xxx  analysis    PRICES.XTR.pack5   (320)
 *      analysis_N_xxx  analysis    PRICES.XTR.single * N * 0.8  (round)
 *      chat_10_xxx     chat        CHAT_PRICE.XTR     (400)
 */
function getExpectedStarsAmount(
  payload: string,
): { amount: number; kind: "analysis" | "chat" } | null {
  if (payload.startsWith("analysis_")) {
    const parts = payload.split("_");
    if (parts.length < 3) return null;
    const quantity = parseInt(parts[1], 10);
    if (!Number.isFinite(quantity) || quantity < 1) return null;

    let amount: number;
    if (quantity === 1) amount = PRICES.XTR.single;
    else if (quantity === 5) amount = PRICES.XTR.pack5;
    else if (quantity > 5) amount = Math.round(PRICES.XTR.single * quantity * 0.8);
    else return null;
    return { amount, kind: "analysis" };
  }

  if (payload.startsWith("chat_")) {
    return { amount: CHAT_PRICE.XTR, kind: "chat" };
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

    // ── pre_checkout_query: validate amount BEFORE Telegram charges user.────
    const preCheckoutQuery = update?.pre_checkout_query;
    if (preCheckoutQuery) {
      const payload = preCheckoutQuery.invoice_payload || "";
      const totalAmount = preCheckoutQuery.total_amount || 0;
      const currency = preCheckoutQuery.currency || "";
      const expected = getExpectedStarsAmount(payload);

      if (currency !== "XTR" || expected === null || totalAmount !== expected.amount) {
        const reason =
          currency !== "XTR"
            ? "Unsupported currency"
            : expected === null
              ? "Unknown invoice payload"
              : `Payment amount mismatch (got ${totalAmount}, expected ${expected.amount})`;

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

    // ── /start command (with optional referral code) ───────────────────────
    if (msg?.text?.startsWith("/start")) {
      const parts = msg.text.split(" ");
      const refCode = parts[1] || "";
      const chatId = msg.chat?.id;
      const firstName = msg.from?.first_name || "";

      const webAppUrl = refCode && /^\d{5,}$/.test(refCode)
        ? `${APP_URL}/?ref=${refCode}`
        : APP_URL;

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
      }).catch((e) => console.error(`[Webhook] /start reply failed: ${e.message}`));

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

    const expected = getExpectedStarsAmount(payload);
    if (!expected || totalAmount !== expected.amount) {
      console.log(`[Webhook] Amount mismatch for ${payload}: got ${totalAmount}, expected ${expected?.amount ?? "?"}`);
      return NextResponse.json({ ok: true });
    }

    // ── Idempotency: refuse to credit the same invoice_payload twice. ─────
    // Telegram may retry webhook delivery; without this guard we'd add paid
    // analyses TWICE on retry. The unique index on ProcessedInvoice.payload
    // protects us at DB level.
    try {
      if (expected.kind === "analysis") {
        const parts = payload.split("_");
        const userId = parts.slice(2).join("_");
        const quantity = parseInt(parts[1], 10);

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          console.log(`[Webhook] User not found: ${userId}`);
          return NextResponse.json({ ok: true });
        }

        await prisma.$transaction([
          prisma.processedInvoice.create({
            data: { payload, userId, kind: "analysis", amount: totalAmount, currency },
          }),
          prisma.user.update({
            where: { id: userId },
            data: { paidAnalyses: { increment: quantity } },
          }),
        ]);
        console.log(`[Webhook] Credited ${quantity} analysis(es) to user ${userId}`);
      } else {
        const parts = payload.split("_");
        const userId = parts.slice(2).join("_");
        const quantity = parseInt(parts[1], 10) || 10;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          console.log(`[Webhook] User not found for chat: ${userId}`);
          return NextResponse.json({ ok: true });
        }

        await prisma.$transaction([
          prisma.processedInvoice.create({
            data: { payload, userId, kind: "chat", amount: totalAmount, currency },
          }),
          prisma.user.update({
            where: { id: userId },
            data: { freeChatQuestions: { increment: quantity } },
          }),
        ]);
        console.log(`[Webhook] Credited ${quantity} chat questions to user ${userId}`);
      }
    } catch (e: any) {
      // P2002 = unique constraint violation on ProcessedInvoice.payload.
      // Already processed → ignore retry.
      if (e?.code === "P2002") {
        console.log(`[Webhook] Duplicate invoice ignored: ${payload}`);
        return NextResponse.json({ ok: true });
      }
      console.error(`[Webhook] Credit error for ${payload}: ${e.message}`);
      return NextResponse.json({ ok: false, error: "credit_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(`[Webhook] Error: ${e.message}`);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
