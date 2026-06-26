import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { authService } from "../services/authService";

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        telegramId: z.string(),
        name: z.string().optional(),
        // 2026-06-26 Phase 1.5 — Telegram @username (without "@" prefix).
        // Stored at first registration; synced on subsequent logins via
        // `me()`. Used by admin as a matcher for manual card-transfer
        // receipts (user puts the same handle in their bank comment).
        username: z.string().optional(),
        referrerId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return authService.findOrCreate(input);
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    // 2026-06-26 Phase 1.5 — `me()` is now the canonical username-sync
    // point. Most existing users never hit `register()` again (it lives
    // in the catch branch of useUser.ts), so without this they'd
    // permanently lack a @username in the DB. We pass ctx.initDataUser
    // (HMAC-verified upstream); sync happens in getProfile().
    return authService.getProfile(ctx.telegramId, ctx.initDataUser);
  }),
});
