import { prisma } from "../db";
import { subscriptionService } from "./subscriptionService";
import { ritualService } from "./ritualService";
import { referralService } from "./referralService";
import { compressImage, generateThumbnail } from "../utils/imageCompression";
import { getPerceptualHash, hammingDistance } from "../utils/perceptualHash";
import { XP_PER_ANALYSIS, calculateLevel, didLevelUp } from "../utils/levelSystem";
import { pushService } from "./pushService";
import { analyzeSkinWithFacePlus, AppQuotaExceededError } from "./facePlusService";
import {
  analyzeSkinWithHuggingFace,
  HFConfigError,
  HFUpstreamError,
} from "./huggingFaceSkinService";
import {
  analyzeSkinWithGemini,
  BadPhotoError,
  GeminiConfigError,
  GeminiUpstreamError,
} from "./geminiSkinService";
import { achievementService } from "./achievementService";
import { russianProductCatalog } from "./russianProductCatalog";

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
// 2026-06-26 — When false, Gemini 2.5 Pro Vision is excluded from
// parallel run regardless of DUAL_PROVIDER_ENABLED. Default true so
// Gemini participates in dual-mode and the user can compare its
// verdict against Face++. Set "false" on deploys where Google free-
// tier 429 rate limits cause unacceptable latency. (Sequential mode
// already skips Gemini automatically — 60s cold-boot exceeds 10s
// Vercel Free budget.)
const GEMINI_PROVIDER_ENABLED = process.env.GEMINI_PROVIDER_ENABLED !== "false";

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
  // 2026-06-26 — defense in depth. Prisma's internal query engine
  // occasionally surfaces column-mismatch errors as `uncaughtException`
  // (sync throw from the engine worker thread, not as a Promise
  // rejection). The `unhandledRejection` guard above does NOT catch
  // these by Node.js semantics. Without this listener, a Prisma
  // error like `rawGemini column does not exist` would bubble out
  // of the tRPC route handler and Vercel's runtime would still kill
  // the lambda with exit code 128 — despite the unhandledRejection
  // guard appearing to work in the logs. Now both error classes are
  // intercepted; the process keeps serving subsequent requests.
  process.on("uncaughtException", (err: any) => {
    console.error(
      "[Analysis] Global uncaughtException guard caught (continuing, NOT exiting):",
      err?.message ?? String(err),
    );
  });
}

/**
 * 2026-06-30 — Translate Gemini's typed errors into actionable Russian
 * user-facing copy. Replaces the previous single-message "сервис
 * временно недоступен" pattern that fired indistinguishably for
 * missing-API-key (operator config), 429-quota-exhausted (user
 * retryable), circuit-breaker-open (transient), safety-filter-block
 * (Google AI's content policy) and generic upstream. The user can
 * now tell at a glance whether the failure is theirs (bad photo),
 * ours (config), recoverable-soon (quota / breaker), or permanent
 * upstream. Each branch logs the raw upstream substring to
 * `console.error` so Vercel function logs carry the actual cause
 * for ops debugging.
 *
 * Branches, ordered by specificity:
 *  1. BadPhotoError — pass-through (defense-in-depth; normally
 *     caught upstream of this helper in `analyze()`).
 *  2. GeminiConfigError — operator-fix; user-facing copy points at
 *     "разработчик работает".
 *  3. GeminiUpstreamError · circuit-breaker open — "30–60 секунд".
 *  4. GeminiUpstreamError · 429 / quota / RESOURCE_EXHAUSTED —
 *     "1–2 минуты".
 *  5. GeminiUpstreamError · safety filter — "фото заблокировано
 *     фильтрами" so the user knows it's a Google AI decision, not
 *     our bug.
 *  6. Generic upstream / uncategorised — conservative
 *     "несколько минут".
 */
function surfaceGeminiFailure(err: unknown): Error {
  if (err instanceof BadPhotoError) return err;
  if (err instanceof GeminiConfigError) {
    console.error(
      "[Analysis] Gemini config error (most likely GEMINI_API_KEY not configured on server):",
      err.message,
    );
    return new Error(
      "ИИ-анализ временно не настроен. Разработчик уже работает над этим — попробуй через час.",
    );
  }
  if (err instanceof GeminiUpstreamError) {
    const raw = err.message ?? "";
    if (/circuit.?breaker/i.test(raw)) {
      console.error("[Analysis] Gemini circuit breaker open:", raw);
      return new Error(
        "Сервис восстанавливается после перегрузки. Подожди 30–60 секунд и попробуй снова.",
      );
    }
    // 2026-06-30 — Schema / 400 branch. Today's root cause
    // `required[1]: property is not defined` slipped past the rate-limit
    // regex into the generic-upstream bucket; user got the blandest copy
    // for a problem that's actually on our side. This branch catches
    // schema drift / INVALID_ARGUMENT / SCHEMA so the operator message
    // points at us, not at the user.
    if (/\b400\b|INVALID_ARGUMENT|response_schema|SCHEMA/i.test(raw)) {
      console.error("[Analysis] Gemini schema / bad-request error (operator-side):", raw);
      return new Error(
        "ИИ-анализ временно не настроен на сервере. Разработчик уже работает над этим.",
      );
    }
    if (/\b429\b|rate.?limit|quota|exceed|RESOURCE_EXHAUSTED/i.test(raw)) {
      console.error("[Analysis] Gemini rate-limit / quota exhausted:", raw);
      return new Error(
        "Превышен лимит запросов к ИИ. Подожди 1–2 минуты и попробуй снова.",
      );
    }
    if (/safety|finishReason|blockReason|HARM_CATEGORY/i.test(raw)) {
      console.error("[Analysis] Gemini safety filter blocked the response:", raw);
      return new Error(
        "Фото заблокировано фильтрами безопасности ИИ. Попробуй другое фото без крупных планов.",
      );
    }
    console.error("[Analysis] Gemini generic upstream failure:", raw);
    return new Error(
      "Сервис анализа временно недоступен. Попробуй через несколько минут.",
    );
  }
  console.error("[Analysis] Uncategorised Gemini error:", String(err));
  return new Error(
    "Сервис анализа временно недоступен. Попробуй через несколько минут.",
  );
}

export const analysisService = {
  /**
   * Analyze a skin photo for the given user.
   *
   * 2026-06-27 — added `providerChoice` parameter. When the client
   * passes "auto" (default, preserved for backward compat) the existing
   * three-provider parallel pipeline runs. When the client passes
   * "faceplus" or "gemini", only that lane runs (hf stays available
   * for Face++ as a silent quota fallback — same as today on the
   * free-tier sequential path). Gemini-only mode is STRICT: no
   * cross-provider fallback if Gemini fails; user gets a focused
   * Russian error message pointing back to the choice modal.
   *
   * Result shape is unchanged: top-level fields mirror the picked
   * verdict; `variants` carries only the providers that actually ran;
   * `provider` field reads as "dual" if multiple lanes succeeded
   * (e.g. Face++ + HF quota fallback), or single provider name
   * otherwise.
   */
  async analyze(
    telegramId: string,
    photoBase64: string,
    description?: string,
    providerChoice: "auto" | "faceplus" | "gemini" = "auto",
  ) {
    // 2026-06-30 — GEMINI-ONLY deployment. Per user request: «оставь только
    // Gemini, face++ больше не пользуемся, оставь код». The Face++ and HF
    // service files are kept on disk (git history + future re-enable) but
    // they MUST NOT be reachable through this entry-point. We pin the
    // providerChoice override at the very top of `analyze()` so any legacy
    // caller / stale client cache / external integration still sending
    // "auto" or "faceplus" silently degrades to the new Gemini path
    // instead of waking up Face++ (which the user is no longer paying
    // for). The provider-picker UI in AnalysisInput.tsx is also gone, so
    // this is defense-in-depth rather than the primary control.
    //
    // CAST NOTE: without `as typeof providerChoice`, TS would narrow the
    // assigned value's type to literal `"gemini"` and flag every
    // downstream `providerChoice === "auto"` comparison as
    // "unintentional" (since the literal set no longer overlaps).
    // Casting back to the parameter's declared union type keeps the
    // strict-mode guards (`if (providerChoice === "gemini" && !geminiVerdict)`
    // etc.) syntactically valid while pinning runtime behavior.
    providerChoice = "gemini" as typeof providerChoice;
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { subscription: true },
    });

    if (!user) throw new Error("User not found");

    const compressedPhoto = await compressImage(photoBase64);
    const photoHash = await getPerceptualHash(compressedPhoto);

    // ── M4: Two-tier duplicate check. ─────────────────────────────────
    // 2026-06-30 — rewritten. The previous code had two bugs:
    //
    //   (1) The fallback O(50) full-history scan only ran when
    //       `user.lastPhotoHash` was null. Once the user had uploaded any
    //       photo, `lastPhotoHash` was set, and the scan was disabled.
    //       Any subsequent upload whose hash drifted by more than 20 bits
    //       (re-encoding noise, EXIF timestamp change, browser-side
    //       recompression) silently bypassed dedup → fresh Gemini call
    //       → quota burn → different result on the same photo.
    //
    //   (2) The O(1) lookup `findFirst({userId, photoHash: user.lastPhotoHash})`
    //       only worked when current photo's hash happened to equal the
    //       stored lastPhotoHash byte-for-byte. For A→B→A sequences
    //       (upload A, then different B, then A again) we'd look up the B
    //       analysis instead of A's, since the most-recent photoHash was B.
    //
    // The fix: always run tier-1 (exact O(1)) THEN tier-2 (O(50) fuzzy
    // scan) regardless of `lastPhotoHash` state, and heal `lastPhotoHash`
    // to the actually-matched hash so the next upload lands in tier 1.
    // ─────────────────────────────────────────────────────────────────
    let cached: { result: unknown; createdAt: Date } | null = null;
    let matchedHash: string | null = null;

    // Tier 1 — O(1) exact match on user.lastPhotoHash.
    if (user.lastPhotoHash) {
      const exact = await prisma.skinAnalysis.findFirst({
        where: { userId: user.id, photoHash: user.lastPhotoHash },
        select: { result: true, createdAt: true, photoHash: true },
      });
      if (exact) {
        cached = { result: exact.result, createdAt: exact.createdAt };
        matchedHash = user.lastPhotoHash;
      }
    }

    // Tier 2 — O(50) threshold scan if tier 1 missed.
    // Always runs (defense-in-depth). Catches A→B→A and the silent
    // hash-drift edge case described above.
    if (!cached) {
      const recent = await prisma.skinAnalysis.findMany({
        where: { userId: user.id, photoHash: { not: null } },
        select: { id: true, photoHash: true, result: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      for (const r of recent) {
        if (
          r.photoHash &&
          hammingDistance(photoHash, r.photoHash) < HASH_SIMILARITY_THRESHOLD
        ) {
          cached = { result: r.result, createdAt: r.createdAt };
          matchedHash = r.photoHash;
          break;
        }
      }
    }

    if (cached) {
      // Heal stale `lastPhotoHash` when tier 2 found a different-but-similar
      // photo. Next upload of the same photo will hit tier 1.
      if (user.lastPhotoHash !== matchedHash) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastPhotoHash: matchedHash },
        });
      }
      const ritual = await ritualService.getStreak(user.id);
      return {
        analysis: cached.result as any,
        xpGained: 0,
        totalXp: user.xp,
        level: user.level,
        streak: ritual.streak,
        maxStreak: ritual.maxStreak,
        cached: true,
        cachedAt: cached.createdAt.toISOString(),
      };
    }

    const access = await subscriptionService.canAccessAnalysis(user.id);
    if (!access.allowed) {
      throw new Error(access.reason || "no_analyses_left");
    }

    // ── Tripe-provider parallel chain (2026-06-25 evening / updated 26) ──
    // Face++ AND Gemini AND HuggingFace all run in parallel via
    // `Promise.allSettled`. We never pre-commit to any one of them — each
    // can succeed independently and give the user a real choice via
    // the tab switcher in ResultModal.
    //
    // Why dual, not fallback-on-quota:
    // Face++ has been observed returning HTTP 200 with all-zero
    // features (no INSUFFICIENT_BALANCE error) after Free-Plan balance
    // hit $0. The previous fallback-on-quota chain silently labelled
    // those responses as "full" quality. Now ALL providers run; the
    // orchestrator's `isBogusResult` gate discards Face++ entries that
    // look empty (`maxValue < 30 && maxConfidence < 0.5 &&
    // weightedScore.totalW === 0`).
    //
    // Quota errors from Face++ still fall through cleanly: a settled
    // `rejected` outcome is treated like any other failure, and the
    // surviving variant (or friendly Russian message if all fail)
    // takes over. The optional `AppQuotaExceededError` subclass is no
    // longer needed for routing but kept exported for backwards compat
    // in case other code paths use it.
    //
    // 2026-06-26 — added Gemini as a 3rd provider. `api-inference.huggingface.co`
    // is no longer reachable from Vercel network; Gemini 2.5 Pro Vision
    // (now added) is reachable and becomes the preferred mid-tier
    // provider between Face++ (richest signals) and HuggingFace YOLO
    // (sparse features).
    // 2026-06-27 — lane selection from the `provider` tRPC input.
    //
    //   "auto"     → fp + gemini + hf (parallel, dual-mode tab UX)
    //   "faceplus" → fp + hf (hf as silent quota fallback only —
    //                 same as today's free-tier sequential path;
    //                 user picked Face++ explicitly for objective scores
    //                 so we don't substitute Gemini's vermouth over HF)
    //   "gemini"   → gemini only (strict, no fallback, friendly error
    //                 on failure so user can re-pick in modal)
    const runFacePlus = providerChoice === "auto" || providerChoice === "faceplus";
    const runGemini =
      providerChoice === "gemini" ||
      (providerChoice === "auto" && GEMINI_PROVIDER_ENABLED);
    const runHF = providerChoice === "auto" || providerChoice === "faceplus";

    const fpPromise = runFacePlus ? analyzeSkinWithFacePlus(compressedPhoto) : null;
    const geminiPromise = runGemini ? analyzeSkinWithGemini(compressedPhoto) : null;
    const hfPromise = runHF ? analyzeSkinWithHuggingFace(compressedPhoto) : null;

    // ── Vercel Free tier guard: when DUAL_PROVIDER_ENABLED=false, run
    // Face++ sequentially first; only swap to HF on AppQuotaExceededError.
    // This stays inside the 10s Vercel Free budget (Face++ alone is 20s
    // wall-clock, but the abort signal is enforced once the request hits
    // the function timeout — so we never waste a cold HF start).
    //
    // Pro tier path: parallel Promise.allSettled for the dual-mode tab UX.
    const fpRes = !fpPromise
      ? null
      : DUAL_PROVIDER_ENABLED
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
    const geminiRes = !geminiPromise
      ? null
      : DUAL_PROVIDER_ENABLED && GEMINI_PROVIDER_ENABLED
        ? await geminiPromise.then(
            (v) => ({ status: "fulfilled" as const, value: v }),
            (e) => ({ status: "rejected" as const, reason: e }),
          )
        : null; // Sequential mode or Gemini opt-out: 60s cold-boot exceeds Vercel Free 10s budget
    const hfRes = !hfPromise
      ? null
      : DUAL_PROVIDER_ENABLED
        ? await hfPromise.then(
            (v) => ({ status: "fulfilled" as const, value: v }),
            (e) => ({ status: "rejected" as const, reason: e }),
          )
        : null; // Free tier: HF already ran inside the sequential IIFE above; outer `hfRes` stays null

    // ── Aggregated verdicts from the parallel/sequential result bags ──────
    // IMPORTANT: order matters — `fpVerdict`, `geminiVerdict` and
    // `hfVerdict` must be declared BEFORE the "all-providers-exhausted"
    // branch below, which references them. Previous attempt left the
    // declarations after the `if` check, causing a TypeScript "Cannot
    // access 'fpVerdict' before initialization" TDZ error.
    // 2026-06-27 — null-guards added on `fpRes` / `fpVerdict` extraction
    // because the user pre-choice may disable the Face++ lane
    // (providerChoice === "gemini" makes fpPromise stay null).
    const fpVerdict =
      fpRes && fpRes.status === "fulfilled" && fpRes.value && fpRes.value.data_quality !== "invalid"
        ? fpRes.value
        : null;
    const geminiVerdict =
      geminiRes && geminiRes.status === "fulfilled" && geminiRes.value && geminiRes.value.data_quality !== "invalid"
        ? geminiRes.value
        : null;
    const hfVerdict =
      hfRes && hfRes.status === "fulfilled" && (hfRes as any).value
        ? (hfRes as any).value.data_quality !== "invalid"
          ? (hfRes as any).value
          : null
        : null;
    const fpInvalidButPersisted =
      fpRes && fpRes.status === "fulfilled" && fpRes.value && fpRes.value.data_quality === "invalid"
        ? fpRes.value
        : null;
    const geminiInvalidButPersisted =
      geminiRes && geminiRes.status === "fulfilled" && geminiRes.value && geminiRes.value.data_quality === "invalid"
        ? geminiRes.value
        : null;
    // Optional chaining since fpRes may now be null (Gemini-only path).
    const fpError = fpRes?.status === "rejected" ? fpRes.reason : null;
    // Free tier (DUAL_PROVIDER_ENABLED=false): hfRes stays null because HF
    // already ran inside the sequential IIFE above. Optional chaining
    // makes this branch null-safe on both Pro and Free paths.
    const hfError = hfRes?.status === "rejected" ? hfRes.reason : null;
    const geminiError = geminiRes?.status === "rejected" ? geminiRes.reason : null;

    // 2026-06-30 — Distinguish "user uploaded a bad photo" from
    // "service is down". The first is the user's mistake (wrong subject,
    // group shot, blurry / dark, side profile) and the right response
    // is "перезагрузи нормальное фото" with photo tips. Surfacing
    // "сервис временно недоступен" there made users blame Reveli for
    // their own mistakes. BadPhotoError is raised by the Gemini service
    // layer (`geminiSkinService.ts`) when the verdict's face_detected
    // boolean is explicitly false; we re-throw with the same payload so
    // the tRPC round-trip preserves it and `page.tsx` shows it via
    // `alert()`.
    if (geminiError instanceof BadPhotoError) {
      console.warn(
        "[Analysis] Bad photo detected by Gemini (face_detected=false). Surfacing photo tips to user.",
      );
      throw new Error(geminiError.message);
    }

    // 2026-06-27 — strict-mode errors for explicit user choices.
    // When the user picked a single provider lane and it failed, the
    // generic "service unavailable" message below is unhelpful — they
    // specifically asked for one provider. Two focused Russian messages
    // point them back to the choice modal so they can re-pick.
    //
    // 2026-06-30 — copy update: removed "Попробуй Face++" because
    // Face++ is no longer accessible (Gemini-only deployment). The
    // user has nothing to switch to; the right action is "повторить
    // через несколько минут". Bad-photo branch above catches the
    // other common error source before this guard runs.
    if (providerChoice === "gemini" && !geminiVerdict) {
      // 2026-06-30 — typed error → actionable UX copy via surfaceGeminiFailure.
      throw surfaceGeminiFailure(geminiError);
    }
    if (providerChoice === "faceplus" && !fpVerdict && !hfVerdict) {
      console.error(
        "[Analysis] User pre-chose 'faceplus' but Face++ failed and HF fallback unavailable.", 
      );
      throw new Error(
        "Face++ сейчас недоступен. Попробуй Gemini или повтори через час.",
      );
    }

    if (!fpVerdict && !geminiVerdict && !hfVerdict) {
      // All three providers either errored or returned bogus data.
      // Log the actual cause(s) so Vercel logs carry the real
      // exception. In our Gemini-only deployment (override above),
      // the gemini bucket IS the actionable lane — surface it via
      // surfaceGeminiFailure which classifies config / circuit-breaker
      // / rate-limit / safety / generic upstream into focused Russian
      // copy. The same copy path keeps the user-facing tone consistent
      // if some future deployment re-enables the multi-lane path.
      console.error(
        "[Analysis] All providers exhausted:",
        {
          faceplus: fpError ?? fpInvalidButPersisted,
          gemini: geminiError ?? geminiInvalidButPersisted,
          huggingface: hfError,
        },
      );
      throw surfaceGeminiFailure(geminiError);
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
    // Default preference order: Face++ (richest) > Gemini (rich but
    // Slower) > HuggingFace (YOLO sparse). But if Face++ found no
    // problems AND Gemini did (e.g. Gemini caught real acne on a
    // clear-skinned photo where Face++ returned legitimately-empty),
    // invert to Gemini so the top-level display surfaces actionable
    // feedback rather than the empty one. Falls back to HF only when
    // both richer providers are absent.
    const fpProblems = fpVerdict?.problems.length ?? 0;
    const geminiProblems = geminiVerdict?.problems.length ?? 0;
    const hfProblems = hfVerdict?.problems.length ?? 0;
    const invertToGemini =
      !!fpVerdict && fpProblems === 0 && geminiProblems > 0 && !!geminiVerdict;
    const invertToHF =
      !!fpVerdict && fpProblems === 0 &&
      (!geminiVerdict || geminiProblems === 0) &&
      hfProblems > 0 && !!hfVerdict;
    const activeProvider: "faceplus" | "gemini" | "huggingface" =
      fpVerdict && !invertToGemini && !invertToHF
        ? "faceplus"
        : (geminiVerdict && !invertToHF ? "gemini" : (hfVerdict ? "huggingface" : "faceplus"));
    const primaryVerdict = (fpVerdict ?? geminiVerdict ?? hfVerdict)!;

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
    if (geminiVerdict) variants.gemini = stripProvider(geminiVerdict);
    if (hfVerdict) variants.huggingface = stripProvider(hfVerdict);

    // 2026-06-30 — Inject russian-market product recommendations.
    // The matcher (`russianProductCatalog`) reads the dominant result's
    // skin_type + problems and returns up to 5 lines (brand+series) from
    // our static catalog of russian-retail-stocked products. Empty
    // array is fine — UI gracefully shows an empty-state nudge.
    // Same attachment for each variant so the user sees the recommendations
    // regardless of which provider tab they switch to.
    const russianProducts = russianProductCatalog.recommend(
      clientResult.skin_type,
      clientResult.problems ?? [],
    );
    clientResult.russian_products = russianProducts.sections;
    for (const key of Object.keys(variants) as Array<keyof typeof variants>) {
      const v = variants[key];
      if (v) {
        v.russian_products = russianProductCatalog.recommend(
          v.skin_type,
          v.problems ?? [],
        ).sections;
      }
    }

    const validCount = (fpVerdict ? 1 : 0) + (geminiVerdict ? 1 : 0) + (hfVerdict ? 1 : 0);
    // 2026-06-26: with three providers, "dual" means ">=2 valid variants"
    // (interpretation unchanged from 2-provider era). User-facing value
    // signals that the analysis came from multiple models.
    const providerField: "faceplus" | "gemini" | "huggingface" | "dual" =
      validCount >= 2 ? "dual" : activeProvider;
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
      // Build the full insert data once so the P2022-fallback path
      // below can replay it with `rawGemini` stripped. Extracting
      // outside the try/catch keeps the retry path declarative.
      const fullSkinAnalysisData = {
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
        rawGemini: geminiVerdict
          ? (geminiVerdict._rawResponse as object)
          : geminiInvalidButPersisted
            ? (geminiInvalidButPersisted._rawResponse as object)
            : undefined,
        rawHuggingFace: hfVerdict ? (hfVerdict._rawResponse as object) : undefined,
        provider: providerField,
        skinType: clientResult.skin_type,
        isFree,
      };
      // 2026-06-26 — graceful P2022 degradation. When the operator
      // hasn't yet applied `prisma/migrations/<ts>_add_raw_gemini/`
      // to the Supabase DB, Postgres returns "column rawGemini does
      // not exist" and Prisma surfaces it as PrismaClientKnownRequestError
      // with code=`P2022`. Without this fallback the entire transaction
      // aborts and Vercel exits the lambda with code 128. We catch the
      // specific P2022 error mentioning `rawGemini`, log a deployment-
      // ops warning, and retry the same INSERT without that column —
      //   the user's analysis still persists and rewards flow normally.
      // Other Prisma errors (constraint violations, connection issues)
      // are re-thrown so transaction semantics stay correct for them.
      let createdAnalysis;
      try {
        createdAnalysis = await tx.skinAnalysis.create({
          data: fullSkinAnalysisData,
        });
      } catch (e: any) {
        const code = e?.code ?? "";
        const msg = String(e?.message ?? "");
        const isMissingGeminiColumn =
          code === "P2022" && /rawGemini/i.test(msg);
        if (isMissingGeminiColumn) {
          console.warn(
            "[Analysis] SkinAnalysis.rawGemini column missing in DB. " +
              "Falling back to write-without-rawGemini. Apply " +
              "prisma/migrations/20260628120000_add_raw_gemini/migration.sql " +
              "in Supabase SQL Editor to enable persistence.",
          );
          createdAnalysis = await tx.skinAnalysis.create({
            data: { ...fullSkinAnalysisData, rawGemini: undefined },
          });
        } else {
          throw e;
        }
      }

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

      return { created: createdAnalysis, newXp: updatedUser.xp, newLevelRaw: updatedUser.level };
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

    // 2026-06-30 — Re-selecting `photoBase64` here because we need the
    // original for server-side downscale (see `withThumbs` below).
    // The cost on Supabase egress is ~150KB × N rows — for users with
    // 50 entries that's ~7MB flowing into the Lambda memory. Painful
    // (DB latency + Prisma JSON deserialisation), but on Vercel Pro
    // (60s timeout) it's bounded. The wire payload leaving the Lambda
    // is what freezes the Mini App on first paint; that's now bounded
    // to ~5KB × N rows = ~250KB after the resize, ~30× smaller.
    // Long-term roadmap: store `photoThumbnail` directly in DB so we
    // don't pay 7MB DB-egress per read.
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

    // 2026-06-30 — Parallel resize of every photo via `sharp`.
    // `lanczos3` + `fastShrinkOnLoad`: ~30-50ms per 1080→256 JPEG.
    // 50 in parallel ≈ 1.5-2.5s wall-clock on Vercel Pro. The output
    // strips the heavy `photoBase64` field entirely so only ~5KB
    // miniatures leave the Lambda for the client (≈30× smaller wire
    // payload vs sending full-res).
    //
    // `Promise.allSettled` (not `Promise.all`) so a single corrupted
    // photo row can't crash the whole list — bad rows fall back to
    // `photoThumbnail: null` and the card renders the letter avatar
    // instead. This matters because legacy rows from the pre-photo
    // migration left some `photoBase64` values as truncated base64
    // strings; sharp rejects those and we want the rest of history
    // to keep working.
    const settled = await Promise.allSettled(
      analyses.map(async (a) => {
        if (!a.photoBase64) {
          const { photoBase64: _omit, ...rest } = a;
          return { ...rest, photoThumbnail: null as string | null };
        }
        const photoThumbnail = await generateThumbnail(a.photoBase64);
        const { photoBase64: _omit, ...rest } = a;
        return { ...rest, photoThumbnail };
      }),
    );
    const withThumbs = settled.map((s, i) => {
      const a = analyses[i];
      if (s.status === "fulfilled") return s.value;
      // Resize failed for this row (corrupted JPEG, malformed base64,
      // etc.). Drop the heavy field, return null thumbnail so the
      // card renders the gradient+letter fallback instead of crashing
      // the whole history page.
      console.warn(
        `[Analysis] getHistory thumb resize failed for ${a.id}: ${
          (s.reason as Error)?.message ?? String(s.reason)
        }`,
      );
      const { photoBase64: _omit, ...rest } = a;
      return { ...rest, photoThumbnail: null };
    });

    return { analyses: withThumbs, total, limit, offset };
  },

  /**
   * 2026-06-30 — Lazy photo endpoint. Paired with the photo-less `getHistory`
   * above: detail modal calls this when the user opens an entry, so the
   * ~150KB base64 photo only travels over the wire on actual demand rather
   * than for every list render. Authorization piggybacks on
   * `userId` + `id` matching so a user can't fetch someone else's photo
   * by guessing the cuid (cuids are not publicly disclosed, but defense
   * in depth is cheap).
   *
   * Returns `null` for legacy rows pre-photo-compression. Callers should
   * render a placeholder in that case.
   */
  async getPhoto(telegramId: string, analysisId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (!user) throw new Error("User not found");

    const row = await prisma.skinAnalysis.findFirst({
      where: { id: analysisId, userId: user.id },
      select: { photoBase64: true },
    });
    if (!row) throw new Error("Analysis not found");

    return { photoBase64: row.photoBase64 ?? null };
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
