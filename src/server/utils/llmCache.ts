/**
 * 2026-06-28 — LLM upstream response cache.
 *
 * Why: every skin analysis currently burns 3-9s on the Groq/Gemini/Face++
 * cascade regardless of whether we've seen the same photo / product
 * formula before. On Vercel Hobby this pushes p95 into the 10s
 * timeout zone during burst. On the cost side, hitting Gemini's free
 * tier 15 RPM quota during a 3-user concurrent burst forfeits the
 * next 60 seconds of analyses (circuit breaker already mitigates but
 * still wastes a request shape).
 *
 * Design:
 *   • Module-level singleton Map — persists for the lifetime of a warm
 *     serverless instance. Cold-start fresh: that's fine, first hit
 *     populates the singleton and subsequent calls within the same
 *     instance reuse it (which covers the burst case).
 *   • SHA-256 hash of the cache key string — fast (~1µs for short
 *     inputs), collision-free at our scale (N < 1M).
 *   • LRU cap of 500 entries per cache. At ~2KB/entry that's ~1MB max
 *     per cache; we run multiple caches each independent (one per
 *     service), so absolute ceiling is <10MB even with all 6 caches
 *     full — well under Vercel's 256MB lambda memory.
 *   • TTL of 24h. Long enough to dedup the same photo / product
 *     across the whole day (a user analyzing twice today gets the
 *     second one instantly). Short enough that prompt drift (new
 *     Gemini model versions, OBF's volunteer database corrections)
 *     naturally rotates results weekly.
 *   • Negative result cache OK: a "no digits found" response can be
 *     cached along with positive ones. Photo OCR failures often
 *     reproduce identically (camera blur, glare), so re-trying the
 *     exact same image MUST hit the cache instead of re-billing the
 *     LLM.
 *
 * Public surface (used by inventoryService, geminiSkinService):
 *   getCached<T>(cacheName, key) → T | null
 *   setCached(cacheName, key, value) → void
 *   memoize<T>(cacheName, keyFn, fn) → Promise<T>     // wrapper
 */

import { createHash } from "node:crypto";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES_PER_CACHE = 500;

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  /** monotonic insert-order counter; lower = older; bumped on every set with active key */
  insertedAt: number;
}

// Per-cache-name singleton state. We use a Map of Maps so each service
// can have an isolated namespace without polluting the others.
const caches = new Map<string, Map<string, CacheEntry<unknown>>>();
let insertCounter = 0;

// 2026-06-28 — concurrent-miss deduplication. Without this, two
// simultaneous memoize() calls for the SAME key both miss the cache,
// both call `fn()`, both pay the (sometimes 5-60s) upstream cost, and
// both write to the cache. Result: 2× LLM bill on every double-tap or
// auto-retry. Tracking the in-flight Promise keyed by `<cacheName>:<hash>`
// lets the second caller `await` the same Promise instead of triggering
// a second upstream call. Promise is removed on settle (resolve OR
// reject) via `.finally()` so a transient upstream failure doesn't
// permanently lock out the key.
const inflight = new Map<string, Promise<unknown>>();

function getCache(cacheName: string): Map<string, CacheEntry<unknown>> {
  let c = caches.get(cacheName);
  if (!c) {
    c = new Map();
    caches.set(cacheName, c);
  }
  return c;
}

/**
 * SHA-256 hex digest of a string. Truncating to 32 chars (128 bits) is
 * well beyond collision-resistance requirements at our scale (we have
 * <50k unique cache keys in production), while keeping map keys short
 * for JSON serialization in Vercel logs.
 */
function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

/**
 * LRU eviction pass: when a cache exceeds its cap, walk from oldest
 * insertion timestamp and drop entries until we're back under cap. This
 * is O(n) where n=500; ~0.1ms — orders of magnitude cheaper than a new
 * upstream LLM call we want to avoid.
 */
function evictIfNeeded(cache: Map<string, CacheEntry<unknown>>): void {
  if (cache.size <= MAX_ENTRIES_PER_CACHE) return;
  const overflow = cache.size - MAX_ENTRIES_PER_CACHE;
  // Sort by insertedAt ascending and drop the `overflow` oldest. Sort
  // is O(n log n) on at most 500 entries; runs at most once per
  // `setCached` call beyond cap.
  const sorted = Array.from(cache.entries()).sort(
    (a, b) => a[1].insertedAt - b[1].insertedAt,
  );
  for (let i = 0; i < overflow; i++) {
    cache.delete(sorted[i][0]);
  }
}

export function getCached<T>(cacheName: string, key: string): T | null {
  const cache = getCache(cacheName);
  const hashed = hash(key);
  const entry = cache.get(hashed);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(hashed);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(cacheName: string, key: string, value: T): void {
  const cache = getCache(cacheName);
  const hashed = hash(key);
  // InsertedAt is monotonically increasing; counter wraps at Number.MAX_SAFE_INTEGER
  // (~9 quadrillion sets) which is fine for any realistic deployment.
  cache.set(hashed, { value, expiresAt: Date.now() + TTL_MS, insertedAt: ++insertCounter });
  evictIfNeeded(cache);
}

/**
 * Convenience wrapper. Use as:
 *
 *   const result = await memoize("inventory:ingredients", [name, brand, ingredients], () =>
 *     analyzeIngredientsImpl(name, brand, ingredients),
 *   );
 *
 * `keyParts` is joined into a single string and hashed. Passing an
 * array (instead of a pre-joined string) lets the caller focus on the
 * data — formatting and hashing happen here. Null/undefined parts are
 * coerced to "" so missing optional fields don't crash the joiner.
 */
export async function memoize<T>(
  cacheName: string,
  keyParts: ReadonlyArray<string | null | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const key = keyParts.map((p) => (p ?? "").toString().toLowerCase()).join("|");
  const cached = getCached<T>(cacheName, key);
  if (cached !== null) return cached;

  const inflightKey = `${cacheName}:${hash(key)}`;
  const pending = inflight.get(inflightKey) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const fresh = await fn();
      setCached(cacheName, key, fresh);
      return fresh;
    } finally {
      inflight.delete(inflightKey);
    }
  })();
  inflight.set(inflightKey, promise);
  return promise;
}

/**
 * Debug helper. Prints cache sizes to console — useful in Vercel logs
 * when investigating "did the cache actually populate?" questions.
 * Not called in production hot paths; ping it from a debug endpoint.
 */
export function cacheStats(): Array<{ name: string; size: number }> {
  return Array.from(caches.entries()).map(([name, c]) => ({ name, size: c.size }));
}
