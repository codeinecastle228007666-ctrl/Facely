import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import {
  verifyTelegramInitData,
  shouldAllowDevAuthFallback,
} from "@/server/utils/telegramAuth";

const BOT_TOKEN = process.env.BOT_TOKEN || "";

const handler = (req: NextRequest) => {
  let telegramId: string | undefined;
  let authSource: "initdata" | "dev-header" | "none" = "none";

  // 1. Production auth: verify Telegram initData HMAC-SHA256 signature.
  const initData = req.headers.get("x-telegram-init-data");
  if (initData && BOT_TOKEN) {
    try {
      const user = verifyTelegramInitData(initData, BOT_TOKEN);
      telegramId = String(user.id);
      authSource = "initdata";
    } catch (e: any) {
      console.error(`[tRPC] initData validation failed: ${e.message}`);
      // Don't fall through — fail securely. telegramId stays undefined.
    }
  } else if (shouldAllowDevAuthFallback()) {
    // 2. Dev/staging fallback: trust x-telegram-id header (NO signature).
    //    Disabled in production unless ALLOW_DEV_AUTH=true is explicitly set.
    const fallback = req.headers.get("x-telegram-id") || undefined;
    if (fallback) {
      telegramId = fallback;
      authSource = "dev-header";
      if (BOT_TOKEN) {
        console.warn(
          `[tRPC] DEV-MODE: trusting unverified x-telegram-id=${fallback}. ` +
            "Set x-telegram-init-data header to bypass this fallback.",
        );
      }
    }
  } else {
    // 3. Production without valid initData + BOT_TOKEN → reject.
    console.error("[tRPC] Production request missing valid initData");
    telegramId = undefined;
  }

  if (!telegramId) {
    // Surface as 401 so client knows it's an auth issue, not a 500.
    return new Response(
      JSON.stringify({ error: { message: "Unauthorized: invalid Telegram initData" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        headers: req.headers,
        telegramId,
      }),
  });
};

export { handler as GET, handler as POST };
