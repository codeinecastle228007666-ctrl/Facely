import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_PANEL_DISABLED_ERROR,
  adminCookieHeader,
  issueAdminToken,
} from "@/server/utils/adminAuth";

/**
 * POST /api/admin/login — exchange ADMIN_PANEL_SECRET for an
 * HttpOnly `admin_session` cookie (HMAC-signed, 8h TTL, SameSite=Lax,
 * Secure in prod). Browser auto-attaches the cookie to all subsequent
 * /api/trpc/admin.* and /api/admin/* calls; verifyAdminToken on the
 * server side rejects tampered or expired cookies.
 *
 * Why a REST route (and not a tRPC mutation)? tRPC over fetch responds
 * with JSON body, not `Set-Cookie` headers — to write cookies we need
 * a Next.js Route Handler that returns NextResponse.json() + .headers.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_PANEL_SECRET || "";
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      { error: ADMIN_PANEL_DISABLED_ERROR },
      { status: 503 },
    );
  }

  let body: { secret?: string } = {};
  try {
    body = (await req.json()) as { secret?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.secret || typeof body.secret !== "string") {
    return NextResponse.json({ error: "Missing `secret` field" }, { status: 400 });
  }

  // Constant-time compare via Buffer — string `===` would leak length
  // info; though length is a fixed env var here, set the discipline
  // even on a 1-line check (#security hygiene).
  const given = Buffer.from(body.secret, "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (given.length !== expected.length) {
    return NextResponse.json({ error: "Wrong secret" }, { status: 401 });
  }
  const { timingSafeEqual } = await import("node:crypto");
  if (!timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Wrong secret" }, { status: 401 });
  }

  const token = issueAdminToken("admin");
  const res = NextResponse.json({ ok: true, expiresInSeconds: 28800 });
  res.headers.set("Set-Cookie", adminCookieHeader(token));
  return res;
}
