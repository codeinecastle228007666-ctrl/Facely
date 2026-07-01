import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { analysisService } from "../services/analysisService";

/**
 * 2026-06-27 — added `provider` enum to the analyze input. When set to
 * "faceplus" or "gemini" only that provider runs (saves quota / latency
 * when user has a clear preference); "auto" keeps the existing parallel
 * three-provider path. Default "auto" preserves backward compat for any
 * older client that doesn't pass the field.
 */
const ProviderChoice = z.enum(["auto", "faceplus", "gemini"]);

export const analysisRouter = router({
  analyze: protectedProcedure
    .input(
      z.object({
        photoBase64: z
          .string()
          // 2026-06-28 — security: explicit upper bound on photo payload.
          // Client-side `compressImage` shrinks to ≤1080px JPEG / quality
          // 0.85 which never exceeds ~600 KB at base64; 10 MB ceiling is
          // a generous safety margin for slow connections / curved-camera
          // edge cases while still blocking DoS-via-50MB-raw-base64
          // strings that would OOM Vercel lambdas or exceed Prisma's
          // row-size limit. Tighten later once we see real max sizes.
          .min(1, "Photo is required")
          .max(10_000_000, "Photo too large (max 10 MB)"),
        description: z.string().max(500).optional(),
        provider: ProviderChoice.optional().default("auto"),
        // 2026-07-01 — Force-reanalyze affordance. UI sets true when
        // the user taps "Это другое фото" in the cache-hit toast.
        // Server interprets by skipping both dedup tiers (HASH_SIMILARITY
        //_THRESHOLD in analysisService.ts) and running the full provider
        // pipeline. Defaults to false via Zod so older clients keep
        // their dedup behaviour untouched.
        forceReanalyze: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await analysisService.analyze(
          ctx.telegramId,
          input.photoBase64,
          input.description,
          input.provider,
          input.forceReanalyze,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        if (message === "no_analyses_left" || message === "no_free_analyses") {
          throw new Error(message);
        }
        throw e;
      }
    }),

  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return analysisService.getHistory(ctx.telegramId, input.limit, input.offset);
    }),

  // 2026-06-30 — Lazy photo endpoint. Replaces the inline `photoBase64`
  // payload that `getHistory` used to return for every record. Called by
  // the history detail bottom-sheet when the user opens an entry; trim
  // the JSON.parse cost of a 7.5MB+ base64 dump on plain list rendering.
  getPhoto: protectedProcedure
    .input(z.object({ analysisId: z.string() }))
    .query(async ({ ctx, input }) => {
      return analysisService.getPhoto(ctx.telegramId, input.analysisId);
    }),

  getComparison: protectedProcedure
    .input(
      z.object({
        analysis1Id: z.string(),
        analysis2Id: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return analysisService.getComparison(ctx.telegramId, input.analysis1Id, input.analysis2Id);
    }),
});
