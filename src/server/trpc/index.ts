import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { prisma } from "../db";
import type { TelegramAuthUser } from "../utils/telegramAuth";

/**
 * 2026-06-26 Phase 1.5 — context now carries the full
 * TelegramAuthUser (parsed + HMAC-verified in route.ts) so any
 * protectedProcedure can silently sync `User.username` and
 * `User.name` from initData without round-tripping the client.
 * Existing callers still work — `telegramId` is the only field they
 * historically read; `initDataUser` is optional and falls back to
 * undefined in dev/staging when only the dev header is present.
 */
export const createTRPCContext = async (opts: {
  headers: Headers;
  telegramId?: string;
  initDataUser?: TelegramAuthUser;
}) => {
  return {
    prisma,
    telegramId: opts.telegramId,
    initDataUser: opts.initDataUser,
    headers: opts.headers,
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

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
