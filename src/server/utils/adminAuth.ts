import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 2026-06-26 — Admin panel auth via HMAC-signed HttpOnly cookie.
 *
 * Why this approach (vs. Telegram Login widget or DB sessions):
 *   • Single fixed admin → no need for user accounts.
 *   • HMAC + secret → tamper-proof, no DB write per session.
 *   • HttpOnly + SameSite=Lax → immune to XSS / cross-origin CSRF.
 *   • Stateless — Vercel serverless has no in-memory state between
 *     invocations, so we'd need a DB anyway; HMAC sidesteps that.
 *
 * Threat model:
 *   • `ADMIN_PANEL_SECRET` leaked → rotate the env var. Old cookies
 *     fail HMAC check and the user re-logs in. No DB cleanup needed.
 *   • Cookie replay → mitigated only by HttpOnly + 8h TTL + SameSite.
 *     (A motivated attacker with cookie file access wins regardless.)
 *
 * Fail-closed: if `ADMIN_PANEL_SECRET` is unset, any token check
 * returns null, login route returns 503, all admin RPCs reject.
 * Never silently grant access.
 */

const ADMIN_PANEL_SECRET = process.env.ADMIN_PANEL_SECRET || "";
const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

export interface AdminSession {
  telegramId: string;
  issuedAt: number;
}

/** base64url (no padding, URL-safe alphabet) — RFC 4648 §5. */
function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  // Re-pad and switch back to standard alphabet.
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padNeeded = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padNeeded), "base64");
}

/**
 * Throw if `ADMIN_PANEL_SECRET` is unset. Used by every code path
 * that issues or verifies tokens — failing fast avoids accidentally
 * issuing NULL-signed tokens.
 */
function requireSecret(): string {
  if (!ADMIN_PANEL_SECRET || ADMIN_PANEL_SECRET.length < 8) {
    throw new Error("ADMIN_PANEL_SECRET not configured (or too short) — admin panel disabled");
  }
  return ADMIN_PANEL_SECRET;
}

/**
 * Issue a fresh signed token. Format: `<base64url(payload)>.<base64url(hmac)>`
 * — payload is JSON of `{ telegramId, issuedAt }`.
 */
export function issueAdminToken(telegramId = "admin"): string {
  const secret = requireSecret();
  const session: AdminSession = { telegramId, issuedAt: Date.now() };
  const payload = b64urlEncode(Buffer.from(JSON.stringify(session), "utf8"));
  const hmac = createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${b64urlEncode(hmac)}`;
}

/**
 * Verify a token. Returns the session on success, null on any failure
 * (bad signature, malformed payload, expired, missing secret). Never
 * throws — caller decides how to handle null.
 */
export function verifyAdminToken(token: string | undefined | null): AdminSession | null {
  if (!token || !ADMIN_PANEL_SECRET) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sigPart] = parts;

  // Recompute HMAC, then **constant-time** compare on raw 32-byte SHA-256.
  // Base64-string comparison is unsafe because string comparison short-
  // circuits on first mismatch and leaks positional info via timing.
  let givenHmac: Buffer;
  try {
    givenHmac = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  const expectedHmac = createHmac("sha256", ADMIN_PANEL_SECRET).update(payload).digest();
  if (givenHmac.length !== expectedHmac.length) return null;
  if (!timingSafeEqual(givenHmac, expectedHmac)) return null;

  let session: AdminSession;
  try {
    session = JSON.parse(b64urlDecode(payload).toString("utf8")) as AdminSession;
  } catch {
    return null;
  }
  if (typeof session?.issuedAt !== "number") return null;
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) return null;

  return session;
}

/**
 * Build Set-Cookie value for the login response. HttpOnly blocks
 * `document.cookie` reads (XSS-proof), SameSite=Lax blocks the
 * most common CSRF vectors, Secure in production prevents plaintext
 * leak on http://.
 */
export function adminCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  return [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "SameSite=Lax",
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Cookie deletion header for /api/admin/logout. */
export function clearAdminCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_PANEL_DISABLED_ERROR =
  "ADMIN_PANEL_SECRET not configured (or too short) — admin panel disabled";
