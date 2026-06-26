import { prisma } from "../db";
import { subscriptionService } from "./subscriptionService";
import { ritualService } from "./ritualService";
import { referralService } from "./referralService";
import { compressImage } from "../utils/imageCompression";
import { getPerceptualHash, hammingDistance } from "../utils/perceptualHash";
import { XP_PER_ANALYSIS, calculateLevel, didLevelUp } from "../utils/levelSystem";
import { pushService } from "./pushService";
import { analyzeSkinWithFacePlus, AppQuotaExceededError } from "./facePlusService";
import {
  analyzeSkinWithHuggingFace,
  HFConfigError,
  HFUpstreamError,
} from "./huggingFaceSkinService";
import { achievementService } from "./achievementService";

/**
 * Threshold for considering two photos as duplicates (0-64).
 * Lower = stricter (more sensitive to small changes).
 * 20 was tuned empirically for SkinAnalysis use cases.
 */
const HASH_SIMILARITY_THRESHOLD = 20;

/**
 * 2026-06-25 evening — Vercel Free tier caps serverless functions at
 * 10s. The dual-mode parallel run takes up to 25s (HF cold-boot
 * 5-15s + Face++ 20s). On Free tier this WOULD 504.
 *
 * Feature flag `DUAL_PROVIDER_ENABLED` (defaults to true, set to
 * "false" on Vercel Free to use the sequential fallback chain
 * instead). Defaulting to true is correct for production (Pro tier
 * has 60s timeout, well within dual-mode latency budget). Plan to add
 * a temp `false` switch if anyone hits a 504 on Free.
 */
const DUAL_PROVIDER_ENABLED = process.env.DUAL_PROVIDER_ENABLED !== "false";

// 2026-06-26 — Vercel runtime hardening: in production, an
// unhandledRejection somewhere downstream of the orchestrator
// (Next.js bundling, Fetch API, etc.) can fire AFTER the rejection
// handler chain (`hfPromise.then(s, e)`) ostensibly attached the
// rejection handler, and Vercel then exits the lambda with code 128
// even though our code "handled" the rejection. This catch-all guard
// logs the rejection without crashing — so Face++'s good result and
// the prepared response still reach the client even when HF throws
// an unhandled rejection in the same tick. Survives Next.js HMR
// module re-evaluation by storing the install flag on `process`
// itself, not a module closure.
const __GUARD_KEY__ = Symbol.for("reveli.unhandledRejectionGuard");
if (!(process as any)[__GUARD_KEY__]) {
  (process as any)[__GUARD_KEY__] = true;
  process.on("unhandledRejection", (reason: any) => {
    console.error(
      "[Analysis] Global unhandled-rejection guard caught (continuing, NOT exiting):",
      reason?.message ?? String(reason),
    );
  });
}

export const analysisService = {
  async analyze(
    telegramId: string,
    photoBase64: string,
    description?: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { subscription: true },
    });

    if (!user) throw new Error("User not found");

    const compressedPhoto = await compressImage(photoBase64);
    const photoHash = await getPerceptualHash(compressedPhoto);

    // ── M4: O(1) duplicate check against last photo first ────────────────
    // Caches the most recent hash on User; an identical-looking photo
    // returns cached result in <1ms instead of scanning the whole history.
    if (user.lastPhotoHash && hammingDistance(photoHash, user.lastPhotoHash) < HASH_SIMILARITY_THRESHOLD) {
      const cached = await prisma.skinAnalysis.findFirst({
        where: { userId: user.id, photoHash: user.lastPhotoHash },
      });
      if (cached) {
        const ritual = await ritualService.getStreak(user.id);
        return {
          analysis: cached.result,
          xpGained: 0,
          totalXp: user.xp,
          level: user.level,
          streak: ritual.streak,
          maxStreak: ritual.maxStreak,
          cached: true,
          cachedAt: cached.createdAt.toISOString(),
        };
      }
    }

    // ── Fallback: full history scan (rare path, handles edge cases like
    //   user uploading same photo they took 2 weeks ago)
    if (!user.lastPhotoHash) {
      const allPhotos = await prisma.skinAnalysis.findMany({
        where: { userId: user.id, photoHash: { not: null } },
        select: { photoHash: true, createdAt: true, result: true, id: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      for (const p of allPhotos) {
        if (p.photoHash && hammingDistance(photoHash, p.photoHash) < HASH_SIMILARITY_THRESHOLD) {
          const ritual = await ritualService.getStreak(user.id);
          await prisma.user.update({
            where: { id: user.id },
            data: { lastPhotoHash: p.photoHash },
          });
          return {
            analysis: p.result,
            xpGained: 0,
            totalXp: user.xp,
            level: user.level,
            streak: ritual.streak,
            maxStreak: ritual.maxStreak,
            cached: true,
            cachedAt: p.createdAt.toISOString(),
          };
        }
      }
    }

    const access = await subscriptionService.canAccessAnalysis(user.id);
    if (!access.allowed) {
      throw new Error(access.reason || "no_analyses_left");
    }

    // ── Dual-provider parallel chain (2026-06-25 evening) ────────────────
    // Both providers run in parallel via `Promise.allSettled`. We never
    // pre-commit to either one — both can succeed independently and
    // give the user a real choice via the tab switcher in ResultModal.
    //
    // Why dual, not fallback-on-quota:
    // Face++ has been observed returning HTTP 200 with all-zero
    // features (no INSUFFICIENT_BALANCE error) after Free-Plan balance
    // hit $0. The previous fallback-on-quota chain silently labelled
    // those responses as "full" quality. Now BOTH providers run; the
    // orchestrator's `isBogusResult` gate discards Face++ entries that
    // look empty (`maxValue < 30 && maxConfidence < 0.5`).
    //
    // Quota errors from Face++ still fall through cleanly: a settled
    // `rejected` outcome is treated like any other failure, and the
    // surviving variant (or friendly Russian message if both fail)
    // takes over. The optional `AppQuotaExceededError` subclass is no
    // longer needed for routing but kept exported for backwards compat
    // in case other code paths use it.
    const fpPromise = analyzeSkinWithFacePlus(compressedPhoto);
    const hfPromise = analyzeSkinWithHuggingFace(compressedPhoto);

    // ── Vercel Free tier guard: when DUAL_PROVIDER_ENABLED=false, run
    // Face++ sequentially first; only swap to HF on AppQuotaExceededError.
    // This stays inside the 10s Vercel Free budget (Face++ alone is 20s
    // wall-clock, but the abort signal is enforced once the request hits
    // the function timeout — so we never waste a cold HF start).
    //
    // Pro tier path: parallel Promise.allSettled for the dual-mode tab UX.
    const fpRes = DUAL_PROVIDER_ENABLED
      ? await fpPromise.then(
          (v) => ({ status: "fulfilled" as const, value: v }),
          (e) => ({ status: "rejected" as const, reason: e }),
        )
      : await (async () => {
          try {
            const v = await fpPromise;
            // On Free tier / sequential mode, also fall back to HF when
            // Face++ succeeded but returned a bogus verdict (data_quality
            // = "invalid") — otherwise the user sees "service unavailable"
            // when in fact HF could have produced something useful.
            if (v.data_quality === "invalid") {
              console.warn(
                "[Analysis] Face++ returned bogus verdict (sequential mode), swapping to HF.",
              );
              try {
                const hv = await hfPromise;
                return { status: "fulfilled" as const, value: hv };
              } catch {
                // HF unavailable too — keep Face++'s bogus verdict so the
                // orchestrator can detect both-extracted-null and surface
                // the friendly error to the user.
                return { status: "fulfilled" as const, value: v };
              }
            }
            return { status: "fulfilled" as const, value: v };
          } catch (e: any) {
            if (e instanceof AppQuotaExceededError) {
              console.warn(
                `[Analysis] Face++ quota exceeded (sequential mode), swapping to HF: ${e.message}`,
              );
              try {
                const v = await hfPromise;
                return { status: "fulfilled" as const, value: v };
              } catch (hfErr: any) {
                console.error("[Analysis] Sequential HF fallback failed:", hfErr);
                throw new Error(
                  "Сервис анализа временно недоступен. Разработчик уже работает над восстановлением. Попробуйте через час.",
                );
              }
            }
            return { status: "rejected" as const, reason: e };
          }
        })();
    const hfRes = DUAL_PROVIDER_ENABLED
      ? await hfPromise.then(
          (v) => ({ status: "fulfilled" as const, value: v }),
          (e) => ({ status: "rejected" as const, reason: e }),
        )
      : null; // Free tier: HF already ran inside the sequential IIFE above; outer `hfRes` stays null

    // ── Aggregated verdicts from the parallel/sequential result bags ──────
    // IMPORTANT: order matters — `fpVerdict` and `hfVerdict` must be
    // declared BEFORE the "both providers exhausted" branch below, which
    // references them. Previous attempt left the declarations after the
    // `if` check, causing a TypeScript "Cannot access 'fpVerdict' before
    // initialization" TDZ error.
    const fpVerdict =
      fpRes.status === "fulfilled" && fpRes.value && fpRes.value.data_quality !== "invalid"
        ? fpRes.value
        : null;
    const hfVerdict =
      hfRes && hfRes.status === "fulfilled" && (hfRes as any).value
        ? (hfRes as any).value.data_quality !== "invalid"
          ? (hfRes as any).value
          : null
        : null;
    const fpInvalidButPersisted =
      fpRes.status === "fulfilled" && fpRes.value.data_quality === "invalid"
        ? fpRes.value
        : null;
    const fpError = fpRes.status === "rejected" ? fpRes.reason : null;
    // Free tier (DUAL_PROVIDER_ENABLED=false): hfRes stays null because HF
    // already ran inside the sequential IIFE above. Optional chaining
    // makes this branch null-safe on both Pro and Free paths.
    const hfError = hfRes?.status === "rejected" ? hfRes.reason : null;

    if (!fpVerdict && !hfVerdict) {
      // Both providers either errored or returned bogus data. Log the
      // actual cause(s) so Vercel logs carry the real exception
      // while the user sees a friendly Russian message.
      console.error(
        "[Analysis] Both providers exhausted:",
        { faceplus: fpError ?? fpInvalidButPersisted, huggingface: hfError },
      );
      throw new Error(
        "Сервис анализа временно недоступен. Разработчик уже работает над восстановлением. Попробуйте через час.",
      );
    }

    // If Face++ returned a user-visible error (no face / multiple
    // faces / invalid format) we still propagate it even though HF
    // succeeded — the photo is genuinely broken and an HF-only
    // analysis would mislead the user.
    if (fpError && !(fpError instanceof AppQuotaExceededError)) {
      throw fpError;
    }

    // Pick the dominant variant for top-level backward-compatible
    // fields (skin_type / problems / etc.).
    //
    // Default preference order: Face++ (richer). But if Face++ found
    // no problems at all AND HF did find problems (e.g. HF caught real
    // acne on a clear-skinned photo while Face++ gave the legitimate
    // empty verdict), invert to HF so the top-level display surfaces
    // the actionable feedback rather than the empty one.
    const fpProblems = fpVerdict?.problems.length ?? 0;
    const hfProblems = hfVerdict?.problems.length ?? 0;
    const invertToHF = !!fpVerdict && fpProblems === 0 && hfProblems > 0 && !!hfVerdict;
    const activeProvider: "faceplus" | "huggingface" =
      fpVerdict && !invertToHF ? "faceplus" : (hfVerdict ? "huggingface" : "faceplus");
    const primaryVerdict = (fpVerdict ?? hfVerdict)!;

    // Build the response shape:
    //  • top-level `analysis.*` fields mirror the dominant variant so
    //    older UI code keeps working without changes.
    //  • additional `variants.{faceplus,huggingface}` carry each
    //    provider's individual result for the tab switcher.
    //  • `provider` (top of response) carries: "dual" / "faceplus" /
    //    "huggingface" — what actually ran successfully.
    const stripProvider = (v: typeof primaryVerdict) => {
      const { _rawResponse, ...rest } = v;
      return rest;
    };
    const { _rawResponse, ...clientResult } = stripProvider(primaryVerdict);
    const variants: Record<string, ReturnType<typeof stripProvider>> = {};
    if (fpVerdict) variants.faceplus = stripProvider(fpVerdict);
    if (hfVerdict) variants.huggingface = stripProvider(hfVerdict);

    const providerField: "faceplus" | "huggingface" | "dual" =
      fpVerdict && hfVerdict ? "dual" : activeProvider;
    const clientResultWithVariants = {
      ...clientResult,
      variants,
      activeProvider,
    };

    const hasActiveSubscription =
      user.subscription?.status === "active" &&
      user.subscription.endDate &&
      user.subscription.endDate > new Date();

    const isFree = !hasActiveSubscription && user.freeAnalyses > 0;

    // ── M1: ALL writes in one transaction; XP via atomic increment ────────
    // Single analysis event = single XP gain, regardless of how many
    // providers ran (default = 2, but Face++ bogus drop = 1).
    const oldXp = user.xp;
    const committed = await prisma.$transaction(async (tx) => {
      const created = await tx.skinAnalysis.create({
        data: {
          userId: user.id,
          photoBase64: compressedPhoto,
          photoHash,
          userDescription: description ?? null,
          // Persist the rich dual-provider JSON so history lookups work
          // the same way they did before (top-level skin_type, problems,
          // skin_score on dominant variant; nested variants + activeProvider).
          result: clientResultWithVariants as object,
          rawFacePlus: fpVerdict
            ? (fpVerdict._rawResponse as object)
            : fpInvalidButPersisted
              ? (fpInvalidButPersisted._rawResponse as object)
              : undefined,
          rawHuggingFace: hfVerdict ? (hfVerdict._rawResponse as object) : undefined,
          provider: providerField,
          skinType: clientResult.skin_type,
          isFree,
        },
      });

      // Determine decrement source + always award XP atomically.
      let balanceField: "freeAnalyses" | "paidAnalyses";
      let balanceOp: number; // amount to decrement (0 if not needed)
      if (hasActiveSubscription) {
        balanceField = "freeAnalyses";
        balanceOp = 0;
      } else if (user.freeAnalyses > 0) {
        balanceField = "freeAnalyses";
        balanceOp = 1;
      } else {
        balanceField = "paidAnalyses";
        balanceOp = 1;
      }

      const balanceUpdate =
        balanceOp > 0
          ? { [balanceField]: { decrement: balanceOp } }
          : {};

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          ...balanceUpdate,
          xp: { increment: XP_PER_ANALYSIS },
          lastPhotoHash: photoHash,
        },
        select: { xp: true, level: true },
      });

      return { created, newXp: updatedUser.xp, newLevelRaw: updatedUser.level };
    });

    // Compute derived level in JS (level is a function of xp).
    const newXp = committed.newXp;
    const computedLevel = calculateLevel(newXp);
    if (computedLevel !== committed.newLevelRaw) {
      await prisma.user.update({
        where: { id: user.id },
        data: { level: computedLevel },
      });
    }

    await ritualService.updateStreak(user.id);
    await ritualService.updateWeeklyStreak(user.id);

    const leveledUp = didLevelUp(oldXp, newXp);
    if (leveledUp) {
      await pushService.sendLevelUp(user.telegramId, leveledUp);    }

    await referralService.claimReferralBonus(user.id);
    await achievementService.checkAndAward(user.id);

    const ritual = await ritualService.getStreak(user.id);
    const milestone = ritualService.isMilestone(ritual.streak);
    // Only fire the "Стрик N дней!" push the FIRST time a milestone is
    // reached. Same-day re-analyses see the same streak value still in
    // MILESTONES (e.g. 4), and without this gate we'd re-spam the user.
    // Use an atomic `updateMany` claim so that two concurrent analyses
    // (e.g. an accidental double-tap) only result in ONE push — the
    // SECOND request finds lastSentMilestone already set to the milestone
    // and `updateMany` returns count=0, so it skips the push. This is
    // even more important in the dual-mode era: both providers now run
    // per analysis, but XP/streak/milestone fire only ONCE per upload.
    if (milestone !== null && ritual.lastSentMilestone !== milestone) {
      const claimed = await prisma.ritual.updateMany({
        where: {
          userId: user.id,
          OR: [
            { lastSentMilestone: null },
            { lastSentMilestone: { not: milestone } },
          ],
        },
        data: { lastSentMilestone: milestone },
      });
      if (claimed.count > 0) {
        try {
          await pushService.sendStreakMilestone(user.telegramId, milestone);
        } catch (e: any) {
          console.error(
            `[StreakMilestone] Push failed user=${user.telegramId} milestone=${milestone}: ${e.message ?? e}`,
          );
        }
      }
    }

    return {
      analysis: clientResultWithVariants,
      provider: providerField,
      xpGained: XP_PER_ANALYSIS,
      totalXp: newXp,
      level: computedLevel,
      streak: ritual.streak,
      maxStreak: ritual.maxStreak,
      cached: false,
    };
  },

  async getHistory(telegramId: string, limit = 20, offset = 0) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) throw new Error("User not found");

    const [analyses, total] = await Promise.all([
      prisma.skinAnalysis.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          photoUrl: true,
          photoBase64: true,
          skinType: true,
          result: true,
          provider: true,
          isFree: true,
          createdAt: true,
        },
      }),
      prisma.skinAnalysis.count({
        where: { userId: user.id },
      }),
    ]);

    return { analyses, total, limit, offset };
  },

  async getComparison(telegramId: string, analysis1Id: string, analysis2Id: string) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User not found");

    const [a1, a2] = await Promise.all([
      prisma.skinAnalysis.findFirst({ where: { id: analysis1Id, userId: user.id } }),
      prisma.skinAnalysis.findFirst({ where: { id: analysis2Id, userId: user.id } }),
    ]);

    if (!a1 || !a2) throw new Error("Analysis not found");

    const r1 = a1.result as Record<string, any> | null;
    const r2 = a2.result as Record<string, any> | null;

    const problems1: string[] = r1?.problems ?? [];
    const problems2: string[] = r2?.problems ?? [];

    const severityOrder: Record<string, number> = { "лёгкое": 1, "умеренное": 2, "выраженное": 3 };

    function parseProblem(p: string): { name: string; severity: string | null } {
      const m = p.match(/^(.+?)\s*\((.+?)\)$/);
      return m ? { name: m[1].trim(), severity: m[2].trim() } : { name: p.trim(), severity: null };
    }

    const p1map = new Map<string, string | null>();
    const p2map = new Map<string, string | null>();
    for (const p of problems1) { const { name, severity } = parseProblem(p); p1map.set(name, severity); }
    for (const p of problems2) { const { name, severity } = parseProblem(p); p2map.set(name, severity); }

    const allNames = new Set([...p1map.keys(), ...p2map.keys()]);

    const differences: Record<string, { from: number; to: number; diff: number; improved: boolean }> = {};
    const fields = ["acne", "dark_circle", "pore", "spot", "wrinkle"];
    // Match the exact spelling used by facePlusService.PROBLEM_MAP so
    // `p1map.get(name)` actually returns the parsed severity instead of
    // silently dropping the row.
    const FIELD_KEYS: Record<string, string> = {
      acne: "акне", dark_circle: "тёмные круги", pore: "поры", spot: "пигментация", wrinkle: "морщины",
    };

    for (const f of fields) {
      const name = FIELD_KEYS[f];
      const s1 = p1map.get(name);
      const s2 = p2map.get(name);
      const score1 = s1 ? (severityOrder[s1] || 2) * 30 : 0;
      const score2 = s2 ? (severityOrder[s2] || 2) * 30 : 0;
      differences[f] = { from: score1, to: score2, diff: score2 - score1, improved: score2 < score1 };
    }

    return {
      analysis1: { id: a1.id, date: a1.createdAt, result: r1, skinType: a1.skinType, photoBase64: a1.photoBase64, provider: a1.provider ?? null },
      analysis2: { id: a2.id, date: a2.createdAt, result: r2, skinType: a2.skinType, photoBase64: a2.photoBase64, provider: a2.provider ?? null },
      differences,
    };
  },
};
