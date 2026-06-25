import crypto from "crypto";

export interface TelegramAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Default `auth_date` freshness window for Telegram initData.
 *
 * Telegram generates `tg.initData` ONCE when a Mini App is opened — the
 * embedded `auth_date` is `now()` at that moment and DOES NOT refresh
 * during the session. Without an explicit reload, the same initData is
 * sent for every subsequent tRPC call.
 *
 * A 5-minute window (the original default) was correct for short-lived
 * bots but breaks long Telegram sessions — users see [tRPC] 401 after
 * a few minutes of browsing. Most production Telegram Mini Apps accept
 * 12-24h; we default to 24h and make it env-configurable.
 *
 * Override via `INIT_DATA_MAX_AGE_SECONDS` env var. Set lower (e.g. 3600)
 * if you need stricter replay protection; set higher for kiosk-style bots.
 */
export const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = (() => {
  const env = process.env.INIT_DATA_MAX_AGE_SECONDS;
  if (!env) return 24 * 60 * 60; // 24 hours
  const parsed = parseInt(env, 10);
  if (!Number.isFinite(parsed) || parsed < 60) return 24 * 60 * 60;
  return parsed;
})();

/**
 * Validate HMAC-SHA256 signature of `tg.initData` against `BOT_TOKEN`.
 *
 * Official Telegram algorithm:
 *   1. Collect all key=value pairs except `hash` itself.
 *   2. Sort pairs lexicographically by key.
 *   3. Join with "\n" into `check_string`.
 *   4. Compute `secret_key = HMAC_SHA256(bot_token, "WebAppData")`.
 *   5. Compute `hash = HMAC_SHA256(check_string, secret_key)` (hex).
 *   6. Compare received `hash` with computed one (constant-time).
 *
 * Additional:
 *   - Reject `auth_date` older than `DEFAULT_INIT_DATA_MAX_AGE_SECONDS`
 *     (replay protection; env-tunable).
 *   - Throw on malformed input rather than returning null, so caller can log + fallback.
 *
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = DEFAULT_INIT_DATA_MAX_AGE_SECONDS,
): TelegramAuthUser {
  if (!initData || typeof initData !== "string") {
    throw new Error("initData is empty");
  }
  if (!botToken) {
    throw new Error("botToken is not configured");
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw new Error("initData missing 'hash' field");

  // Step 1: build check_string with all params EXCEPT hash, sorted by key.
  params.delete("hash");
  const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const checkString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  // Step 2: derive secret key from bot token.
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  // Step 3: compute expected hash.
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  // Step 4: compare in constant time.
  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(receivedHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("initData signature mismatch");
  }

  // Step 5: replay protection (auth_date).
  const authDateRaw = params.get("auth_date");
  const authDate = parseInt(authDateRaw || "0", 10);
  if (!authDate) throw new Error("initData missing 'auth_date' field");
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > maxAgeSeconds) {
    throw new Error(`initData expired (age ${ageSec}s, max ${maxAgeSeconds}s)`);
  }

  // Step 6: extract embedded user object.
  const userJson = params.get("user");
  if (!userJson) throw new Error("initData missing 'user' field");
  const user = JSON.parse(userJson) as Record<string, unknown>;
  if (typeof user.id !== "number" && typeof user.id !== "string") {
    throw new Error("initData 'user.id' is missing or invalid");
  }

  return {
    id: Number(user.id),
    first_name: typeof user.first_name === "string" ? user.first_name : undefined,
    last_name: typeof user.last_name === "string" ? user.last_name : undefined,
    username: typeof user.username === "string" ? user.username : undefined,
    photo_url: typeof user.photo_url === "string" ? user.photo_url : undefined,
    auth_date: authDate,
    hash: receivedHash,
  };
}

/**
 * Returns true if we should accept `x-telegram-id` header without signature verification.
 * Active when:
 *   - NODE_ENV !== "production" (dev/staging)
 *   - OR ALLOW_DEV_AUTH env flag is set
 *
 * In production with a valid BOT_TOKEN, every request must include valid `x-telegram-init-data`.
 */
export function shouldAllowDevAuthFallback(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.ALLOW_DEV_AUTH === "true") return true;
  return false;
}
