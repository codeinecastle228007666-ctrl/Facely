/**
 * 2026-06-28 — Sharp cold-start warm-up.
 *
 * Vercel's first request to a cold Node.js lambda pays a one-time
 * 1-3 second penalty while the `sharp` native module unloads its
 * bundled libvips into memory and JIT-compiles V8's lazy edges. This
 * penalty hits the user as "Loading..." spinner stuck on a blank screen.
 *
 * Next 15 instrumentation hook (`register()`) runs ONCE per cold
 * lambda start, BEFORE any request reaches a route handler — so the
 * stub resize below happens during the cold-start window that Vercel
 * already charges us for, and the first production resize in a route
 * handler returns in <50ms instead of 1-3s.
 *
 * Why not just import `sharp` at the top: a bare `_unused` import would
 * still trigger libvips, but Vercel's bundler can sometimes tree-shake
 * unused imports in production builds. Running an actual operation
 * (1x1 PNG toBuffer) guarantees the work happens at warm-up time and
 * is observable in Vercel cold-start logs as the FIRST sharp call.
 *
 * `NEXT_RUNTIME === "nodejs"` guard prevents the registration from
 * running in Edge runtime builds where sharp isn't available anyway.
 */

/**
 * Next.js calls `register()` exactly once per cold start of each Node.js
 * runtime worker. We don't await the warm-up at module-load — we put it
 * inside an async wrapper so the rest of the module's top-level code
 * (including the `condition` export below) still executes first. The
 * warm-up itself is fire-and-forget: we don't await it on the public
 * module path because we want `register()` itself to return promptly
 * (Next.js's instrumentation contract doesn't tolerate long-running
 * register bodies — it logs a warning after 5s).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fire-and-forget: don't await. Promise rejection (extremely rare
  // — only if sharp's bundled binary is corrupt) is caught so it
  // doesn't surface as a runtime crash. The promise itself lives for
  // the lifetime of the lambda instance; by the time the first
  // production resize runs, the warm-up has long completed.
  (async () => {
    try {
      const sharp = (await import("sharp")).default;
      // 1x1 transparent PNG → PNG buffer: cheapest possible output
      // path that still forces libvips initialization + module-load
      // of all resize/jpeg/png decoders. Output discarded.
      const buf = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      // Surface the buffer length in Vercel logs so cold-start
      // metrics can correlate sharp's first-call time with
      // subsequent request latency. Remove if log noise becomes
      // problematic.
      if (process.env.SHARP_WARMUP_DEBUG === "1") {
        console.log(`[Sharp warm-up] initialized, output=${buf.length}B`);
      }
    } catch (e: any) {
      // Don't crash the lambda — if sharp's native binding is
      // missing on this runtime (shouldn't happen on Vercel nodejs),
      // production route handlers will get their own sharp error
      // instead of a startup failure.
      console.warn(
        `[Sharp warm-up] failed: ${e?.message ?? String(e)} — first request will pay cold-start tax.`,
      );
    }
  })();
}
