import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { prisma } from "../db";
import type { TelegramAuthUser } from "../utils/telegramAuth";
import {
  extractAdminCookie,
  verifyAdminToken,
  ADMIN_PANEL_DISABLED_ERROR,
} from "../utils/adminAuth";
import type { AdminSession } from "../utils/adminAuth";

/**
 * 2026-06-26 Phase 1.5 — context now carries the full
 * TelegramAuthUser (parsed + HMAC-verified in route.ts) so any
 * protectedProcedure can silently sync `User.username` and
 * `User.name` from initData without round-tripping the client.
 * Existing callers still work — `telegramId` is the only field they
 * historically read; `initDataUser` is optional and falls back to
 * undefined in dev/staging when only the dev header is present.
 *
 * 2026-06-26 — /admin panel auth: we also parse the
 * `admin_session` HttpOnly cookie from the request header and feed
 * it into ctx as `adminSession`. The cookie is the source of truth
 * for admin-side procedures (no Telegram auth required). Fail-closed:
 * if `ADMIN_PANEL_SECRET` is unset, verifyAdminToken returns null
 * regardless of cookie content.
 */
export const createTRPCContext = async (opts: {
  headers: Headers;
  telegramId?: string;
  initDataUser?: TelegramAuthUser;
}) => {
  // 2026-06-26 — DRY: shared cookie extractor (also used by
  // src/app/api/trpc/[trpc]/route.ts for the early initData gate).
  const cookieToken = extractAdminCookie(opts.headers);
  const adminSession: AdminSession | null = verifyAdminToken(cookieToken ?? undefined);

  return {
    prisma,
    telegramId: opts.telegramId,
    initDataUser: opts.initDataUser,
    headers: opts.headers,
    adminSession,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.telegramId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, telegramId: ctx.telegramId } });
});

/**
 * 2026-06-26 — admin-protected middleware. Requires valid HMAC-signed
 * `admin_session` cookie (proven via adminAuth.verifyAdminToken in
 * createTRPCContext above), AND a configured `ADMIN_PANEL_SECRET`.
 * Both must hold. Fails closed if secret is unset or cookie is
 * absent/expired/tampered.
 *
 * Use this for any procedure that lives under `adminRouter.*` so the
 * /admin panel works from a regular browser without the Telegram
 * Mini App. Do NOT use it for user-facing endpoints — those keep
 * `protectedProcedure` (Telegram auth).
 */
const isAdminAuthenticated = t.middleware(({ ctx, next }) => {
  if (!process.env.ADMIN_PANEL_SECRET) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: ADMIN_PANEL_DISABLED_ERROR,
    });
  }
  if (!ctx.adminSession) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Admin session required (login at /admin)",
    });
  }
  return next({ ctx: { ...ctx, adminSession: ctx.adminSession } });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
export const adminProtectedProcedure = t.procedure.use(isAdminAuthenticated);
