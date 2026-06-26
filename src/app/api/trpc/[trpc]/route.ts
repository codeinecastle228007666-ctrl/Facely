import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import {
  verifyTelegramInitData,
  shouldAllowDevAuthFallback,
  type TelegramAuthUser,
} from "@/server/utils/telegramAuth";
import {
  extractAdminCookie,
  verifyAdminToken,
} from "@/server/utils/adminAuth";

const BOT_TOKEN = process.env.BOT_TOKEN || "";

const handler = (req: NextRequest) => {
  // 2026-06-26 — /admin panel routes authenticate via the HMAC-signed
  // HttpOnly `admin_session` cookie (set by POST /api/admin/login), NOT
  // via Telegram initData. We parse + HMAC-verify the cookie up-front so
  // we can bypass the initData gate below for /api/trpc/admin.* paths.
  // HMAC is what actually proves authenticity — without ADMIN_PANEL_SECRET
  // no cookie can be forged, so adminSession === null still falls through
  // to the standard 401 path. Same cookie is re-fed into createTRPCContext
  // so adminProtectedProcedure checks ctx.adminSession on the way in.
  // 2026-06-26 — DRY: cookie extract via adminAuth.extractAdminCookie
  // (shared with createTRPCContext in src/server/trpc/index.ts).
  const cookieToken = extractAdminCookie(req.headers);
  const adminSession = verifyAdminToken(cookieToken ?? undefined);

  // adminRouter is the only router that uses the `admin.*` procedure
  // prefix. Anything under that prefix is allowed through on a valid
  // admin cookie regardless of Telegram initData. Everything else still
  // demands initData as before.
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

  if (!telegramId && !(isAdminPath && adminSession !== null)) {
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
