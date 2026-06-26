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

    // ── Two-tier provider chain ──────────────────────────────────────────────
    // 1. Face++ primary — trusted, 16-feature structured response,
    //    sets `data_quality: "full"` on its AnalysisVerdict.
    // 2. HuggingFace fallback — kicks in ONLY on quota exhaustion
    //    (INSUFFICIENT_BALANCE / CONCURRENCY_LIMIT_EXCEEDED). Sets
    //    `data_quality: "partial"` on its AnalysisVerdict (only detects
    //    acne/spot/mole/wrinkle). ResultModal reads this and renders an
    //    honest degraded-mode banner.
    //
    // Other Face++ errors (no face, multiple faces, invalid format)
    // are NOT swappable — they describe the user's photo and are
    // surfaced verbatim.
    let provider: "faceplus" | "huggingface" = "faceplus";
    let result;
    try {
      result = await analyzeSkinWithFacePlus(compressedPhoto);
    } catch (e: any) {
      if (!(e instanceof AppQuotaExceededError)) {
        throw e; // user-visible message (no face, image format, etc.)
      }
      console.warn(
        `[Analysis] Face++ quota exceeded, swapping to HuggingFace fallback: ${e.message}`,
      );
      try {
        result = await analyzeSkinWithHuggingFace(compressedPhoto);
      } catch (hfErr: any) {
        // Always log the actual cause BEFORE re-throwing the friendly
        // message — even in the catch-all branch where the error
        // type isn't recognized. Observability matters more than
        // cosmetic code symmetry here.
        console.error(
          "[Analysis] HuggingFace fallback failed (both providers now exhausted):",
          hfErr,
        );
        throw new Error(
          "Сервис анализа временно недоступен. Разработчик уже работает над восстановлением. Попробуйте через час.",
        );
      }
      provider = "huggingface";
    }

    // ── Strip `_rawResponse` before sending to client. Face++ raw JSON is
    //    persisted separately as `rawFacePlus`; HF YOLO detections go to
    //    `rawHuggingFace`. `_rawResponse` never leaves the server. Each
    //    provider sets its own `data_quality` on the verbatim AnalysisVerdict
    //    so this destructure carries it through naturally.
    //
    // 2026-06-25 history:
    //   - Groq `analyzeProblemPositions` visual overlay dropped
    //     (misclassifying nostrils/eyebrows/lips as inflammation).
    //   - Jun-25 evening: HuggingFace fallback added for the Free-Plan
    //     balance outage.
    const { _rawResponse, ...clientResult } = result;

    const hasActiveSubscription =
      user.subscription?.status === "active" &&
      user.subscription.endDate &&
      user.subscription.endDate > new Date();

    const isFree = !hasActiveSubscription && user.freeAnalyses > 0;

    // ── M1: ALL writes in one transaction; XP via atomic increment ────────
    // Avoids race condition where two concurrent analyses overwrite xp/level.
    const oldXp = user.xp;
    const committed = await prisma.$transaction(async (tx) => {
      const created = await tx.skinAnalysis.create({
        data: {
          userId: user.id,
          photoBase64: compressedPhoto,
          photoHash,
          userDescription: description ?? null,
          result: clientResult as object,
          rawFacePlus: provider === "faceplus" ? (_rawResponse as object) : undefined,
          rawHuggingFace: provider === "huggingface" ? (_rawResponse as object) : undefined,
          provider,
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
      await pushService.sendLevelUp(user.telegramId, leveledUp);
    }

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
    // and `updateMany` returns count=0, so it skips the push.
    // Trade-off: if the push fails after the claim, the user misses that
    // one celebration, but DB stays consistent (no spam on retry).
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
      analysis: clientResult,
      provider,
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
      analysis1: { id: a1.id, date: a1.createdAt, result: r1, skinType: a1.skinType, photoBase64: a1.photoBase64 },
      analysis2: { id: a2.id, date: a2.createdAt, result: r2, skinType: a2.skinType, photoBase64: a2.photoBase64 },
      differences,
    };
  },
};
