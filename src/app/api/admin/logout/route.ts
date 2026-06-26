import { NextResponse } from "next/server";
import { clearAdminCookieHeader } from "@/server/utils/adminAuth";

/**
 * POST /api/admin/logout — clears the `admin_session` cookie via
 * Set-Cookie with Max-Age=0. No body required. Idempotent.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearAdminCookieHeader());
  return res;
}
