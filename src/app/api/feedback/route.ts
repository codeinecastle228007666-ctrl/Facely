import { NextRequest } from "next/server";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const CHAT_ID = process.env.FEEDBACK_CHAT_ID || process.env.DEV_CHAT_ID || "";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "empty" }, { status: 400 });
    }

    const text = `📝 Новый отзыв\n\n${message.trim()}`;

    if (BOT_TOKEN && CHAT_ID) {
      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
      });
      if (!tgRes.ok) {
        const errBody = await tgRes.text().catch(() => "");
        console.error(`[feedback] Telegram API error ${tgRes.status}: ${errBody.slice(0, 300)}`);
      }
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("[feedback] Error:", e instanceof Error ? e.message : e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
