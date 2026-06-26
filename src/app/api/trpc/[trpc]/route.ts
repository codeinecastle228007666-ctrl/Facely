import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import {
  verifyTelegramInitData,
  shouldAllowDevAuthFallback,
  type TelegramAuthUser,
} from "@/server/utils/telegramAuth";

const BOT_TOKEN = process.env.BOT_TOKEN || "";

const handler = (req: NextRequest) => {
  // 2026-06-26 — /api/trpc/admin.* routes authenticate via the HMAC-signed
  // HttpOnly `admin_session` cookie (set by POST /api/admin/login), NOT
  // via Telegram initData. They reach fetchRequestHandler regardless of
  // initData; adminProtectedProcedure enforces cookie auth inside the
  // router via createTRPCContext (which HMAC-verifies the cookie).
  //
  // Critically: `adminRouter.status` is intentionally `publicProcedure`
  // so the /admin page can render "panel disabled" BEFORE login. The gate
  // below lets every admin.* request through; auth enforcement happens
  // inside adminProtectedProcedure once admin.me, admin.searchUsers,
  // admin.grant, etc. are reached. Without this bypass the page would
  // show "panel disabled" even with ADMIN_PANEL_SECRET set — because
  // status() itself would 401.
  const pathname =
    req.nextUrl?.pathname ?? new URL(req.url).pathname;
  const isAdminPath = pathname.startsWith("/api/trpc/admin.");

  let telegramId: string | undefined;
  let initDataUser: TelegramAuthUser | undefined;
  let authSource: "initdata" | "dev-header" | "none" = "none";

  // 1. Production auth: verify Telegram initData HMAC-SHA256 signature.
  const initData = req.headers.get("x-telegram-init-data");
  if (initData && BOT_TOKEN) {
    try {
      const user = verifyTelegramInitData(initData, BOT_TOKEN);
      telegramId = String(user.id);
      initDataUser = user;
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
      // 2026-06-26 Phase 1.5 — no initDataUser in dev-mode → no username
      // sync (dev doesn't ship to real Telegram users anyway).
      authSource = "dev-header";
      if (BOT_TOKEN) {
        console.warn(
          `[tRPC] DEV-MODE: trusting unverified x-telegram-id=${fallback}. ` +
            "Set x-telegram-init-data header to bypass this fallback.",
        );
      }
    }
  } else if (!isAdminPath) {
    // 3. Production without valid initData + BOT_TOKEN → reject.
    // Logged at WARN (not ERROR) because this is expected when users open the
    // Mini App URL in a regular browser (e.g. desktop link preview) or when
    // `window.Telegram.WebApp.initData` is briefly empty during Mini App
    // bootstrap. Genuine auth attacks are still rejected (401 below).
    // Skipped for admin.* paths — /admin is opened in a regular browser
    // and legitimately never sends initData. Admin auth is enforced by
    // adminProtectedProcedure further down.
    console.warn("[tRPC] Production request without valid initData header");
    telegramId = undefined;
  }

  if (!telegramId && !isAdminPath) {
    // Surface as 401 with a structured code so the client can show a
    // meaningful "please reopen from Telegram" message instead of crashing.
    return new Response(
      JSON.stringify({
        error: {
          code: "UNAUTHORIZED",
          message: "Open Reveil from the Telegram Mini App to continue",
        },
      }),
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
        initDataUser,
      }),
  });
};

export { handler as GET, handler as POST };
