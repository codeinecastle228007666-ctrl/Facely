import { prisma } from "../db";
import { subscriptionService } from "./subscriptionService";
import { ritualService } from "./ritualService";
import { referralService } from "./referralService";
import { compressImage } from "../utils/imageCompression";
import { getPerceptualHash, hammingDistance } from "../utils/perceptualHash";
import { XP_PER_ANALYSIS, calculateLevel, didLevelUp } from "../utils/levelSystem";
import { pushService } from "./pushService";
import { analyzeSkinWithFacePlus } from "./facePlusService";
import { achievementService } from "./achievementService";
import type { ProblemPosition } from "@/services/api";

// ── Groq vision: detect problem positions on the photo ────────────────
// Same proven two-model fallback pattern used by inventoryService OCR
// (meta-llama/llama-4-scout-17b-16e-instruct → qwen/qwen3.6-27b).
//
// Why ONLY positions, not severity refinement:
//   The June-24 version asked Groq for {type, x, y, radius} coordinates
//   and worked reliably. The June-25 attempt asked for severity reasoning
//   and additional_problems in JSON and crashed with parse errors
//   (`Expected ',' or ']' after array element in JSON at position 103`).
//   Coordinate-only output is what llama-4-scout excels at; multi-
//   property JSON with Russian severity classification is too brittle.
//
// Visual overlay (`result.problem_positions`) is what gives users the
// "objective" feel — even when Face++ scores everything near 0 (its
// categorical granularity of 0/60/100 misses nuance), the marked
// circles on their face show what the AI actually saw.
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

async function analyzeProblemPositions(photoBase64: string): Promise<ProblemPosition[] | null> {
  if (!GROQ_API_KEY) return null;

  const models = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3.6-27b",
  ];

  for (const model of models) {
    try {
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Найди проблемы кожи на этом фото. Верни JSON с координатами каждого проблемного участка. Формат: {\"problems\":[{\"type\":\"pimple\",\"label\":\"воспаление\",\"x\":50,\"y\":50,\"radius\":4}]}. type: pimple, spot, redness, wrinkle, dark_circle, large_pore, pigmentation. x y от 0 до 100. Не пиши ничего кроме JSON.",
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${photoBase64}` },
                },
              ],
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let raw = data.choices?.[0]?.message?.content || "";
        // Strip markdown code blocks
        raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
        // Try parsing as-is; fall back to handling double-encoded JSON;
        // finally fall back to regex extraction of the first {...} block.
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          if (raw.startsWith('"') && raw.endsWith('"')) {
            try { parsed = JSON.parse(raw); } catch { /* ignore */ }
          }
          if (!parsed) {
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) {
              try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
            }
          }
        }
        if (parsed) {
          const positions: ProblemPosition[] =
            (Array.isArray(parsed.problems) ? parsed.problems : null) ||
            (Array.isArray(parsed.positions) ? parsed.positions : null) ||
            [];
          // Basic shape validation + clamp coords into SVG-safe ranges.
          // ResultModal draws into a 0-100 viewBox; an out-of-range x/y
          // from the model would render the circle off-screen, and an
          // oversized radius would dominate the photo. Cheap defense.
          const valid: ProblemPosition[] = positions.flatMap((p) => {
            if (
              !p ||
              typeof p.type !== "string" ||
              typeof p.x !== "number" ||
              typeof p.y !== "number" ||
              typeof p.radius !== "number"
            ) {
              return [];
            }
            return [{
              type: p.type,
              label: typeof p.label === "string" ? p.label : p.type,
              x: Math.max(0, Math.min(100, p.x)),
              y: Math.max(0, Math.min(100, p.y)),
              radius: Math.max(0, Math.min(30, p.radius)),
            }];
          });
          if (valid.length > 0) {
            console.log(`[GroqPositions] ${model} returned ${valid.length} positions`);
            return valid;
          }
        }
      } else {
        const errBody = await res.text().catch(() => "");
        console.error(
          `[GroqPositions] ${model} failed:`,
          res.status,
          errBody.slice(0, 200),
        );
      }
    } catch (e: any) {
      console.error(`[GroqPositions] ${model} error:`, e?.message ?? e);
    }
  }
  return null;
}

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

    const result = await analyzeSkinWithFacePlus(compressedPhoto);

    // ── Groq problem positions over the photo (visual overlay) ────────
    // Run AFTER Face++ so a single Face++ timeout doesn't block analysis,
    // and BEFORE the destructure so positions are part of `clientResult`
    // and end up in the persisted `result` field.
    // `analyzeProblemPositions` catches every internal error and
    // returns `null` on failure — no outer wrapping needed.
    const positions = await analyzeProblemPositions(compressedPhoto);
    if (positions && positions.length > 0) {
      result.problem_positions = positions;
    }

    // ── Strip `_rawResponse` from the cooked result we send to clients.
    //    Face++ raw JSON is persisted separately as `rawFacePlus` so we
    //    can re-score old records when scoring logic improves without
    //    re-paying the API quota.
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
          rawFacePlus: _rawResponse as object,
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
