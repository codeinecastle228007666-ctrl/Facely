import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { PRICES, CHAT_PRICE, SUBSCRIPTION_DAYS } from "@/lib/pricing";

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
 * 2026-06-26 — tier-based payload routing. Returns the expected invoice
 * amount for a given invoice_payload, using the SAME pricing matrix that
 * `subscriptionService.createStarsInvoice` uses to bill the user. If
 * no tier matches the payload, returns null so Telegram rejects the
 * payment (better than crediting wrong amount).
 *
 *      payload                   kind         expected amount (XTR stars)
 *      analysis_single_xxx       analysis     PRICES.XTR.single  (70)
 *      analysis_pack5_xxx        analysis     PRICES.XTR.pack5   (280)
 *      subscription_monthly_xxx  subscription PRICES.XTR.monthly (1200)
 *      analysis_1_xxx (legacy)   analysis     PRICES.XTR.single  (70)
 *      analysis_5_xxx (legacy)   analysis     PRICES.XTR.pack5   (280)
 *      analysis_N_xxx (legacy)   analysis     PRICES.XTR.single * N * 0.8 (round)
 *      chat_10_xxx               chat         CHAT_PRICE.XTR      (350)
 */
function getExpectedStarsAmount(
  payload: string,
):
  | { amount: number; kind: "analysis"; quantity: number }
  | { amount: number; kind: "subscription"; quantity: number }
  | { amount: number; kind: "chat"; quantity: number }
  | null {
  const parts = payload.split("_");
  if (parts.length < 3) return null;
  const prefix = parts[0];
  const seg1 = parts[1];

  if (prefix === "chat") {
    // 2026-06-28 — strict equality on `chat_10_<uid>`. The previous
    // parser accepted any integer (e.g. `chat_100_<uid>`) but priced
    // it at the flat CHAT_PRICE.XTR (350 ⭐), letting a forged
    // payload buy unlimited questions for the cost of a 10-pack.
    // Pre-checkout_query would also accept the forged payload since
    // amount stayed flat, so this was an end-to-end matrix-price bug.
    if (seg1 !== "10") return null;
    return { amount: CHAT_PRICE.XTR, kind: "chat", quantity: 10 };
  }

  // 2026-06-26 NEW: monthly via one-time Stars — activate 30-day Sub.
  if (prefix === "subscription" && seg1 === "monthly") {
    return {
      amount: PRICES.XTR.monthly,
      kind: "subscription",
      quantity: SUBSCRIPTION_DAYS,
    };
  }

  if (prefix === "analysis") {
    // 2026-06-26 NEW tier-based: tier is a lowercase string, not a number.
    if (seg1 === "single") return { amount: PRICES.XTR.single, kind: "analysis", quantity: 1 };
    if (seg1 === "pack5") return { amount: PRICES.XTR.pack5, kind: "analysis", quantity: 5 };

    // LEGACY qty-based: `analysis_<int>_<uid>` (in-flight payments only).
    const quantity = parseInt(seg1, 10);
    if (!Number.isFinite(quantity) || quantity < 1) return null;
    let amount: number;
    if (quantity === 1) amount = PRICES.XTR.single;
    else if (quantity === 5) amount = PRICES.XTR.pack5;
    else if (quantity > 5) amount = Math.round(PRICES.XTR.single * quantity * 0.8);
    else return null;
    return { amount, kind: "analysis", quantity };
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
    // analyses / activate subscription TWICE on retry. The unique index on
    // ProcessedInvoice.payload protects us at DB level.
    try {
      const parts = payload.split("_");
      const userId = parts.slice(2).join("_");
      const quantity = expected.quantity;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        console.log(`[Webhook] User not found for payload ${payload}: userId ${userId}`);
        return NextResponse.json({ ok: true });
      }

      if (expected.kind === "analysis") {
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
      } else if (expected.kind === "subscription") {
        // 2026-06-26 NEW: one-time monthly Stars payment activates a
        // Subscription for SUBSCRIPTION_DAYS (30). Atomic with the
        // ProcessedInvoice insert so retries don't double-activate.
        // Date math matches `subscriptionService.activate` (local-TZ
        // .setDate) for consistency.
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + SUBSCRIPTION_DAYS);
        await prisma.$transaction([
          prisma.processedInvoice.create({
            data: { payload, userId, kind: "subscription", amount: totalAmount, currency },
          }),
          prisma.subscription.upsert({
            where: { userId },
            update: {
              status: "active",
              type: "paid",
              endDate,
              startDate: new Date(),
            },
            create: {
              userId,
              status: "active",
              type: "paid",
              startDate: new Date(),
              endDate,
            },
          }),
        ]);
        console.log(
          `[Webhook] Activated ${SUBSCRIPTION_DAYS}day subscription for user ${userId} (Stars-monthly)`,
        );
      } else {
        // kind === "chat"
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
