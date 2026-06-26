import superjson from "superjson";

/**
 * /admin page lives OUTSIDE Telegram Mini App, so it can't use the
 * default TRPCProvider (which expects `window.Telegram.WebApp.*`).
 * These helpers mirror `src/services/api.ts` patterns (raw fetch +
 * superjson) but with `credentials: "include"` so the HttpOnly
 * `admin_session` cookie travels on every request.
 */
const TRPC = "/api/trpc";

async function callTrpc<T>(path: string, input?: unknown): Promise<T> {
  // Procedures without `.input(...)` (e.g. `admin.status`) are queried
  // without the `?input=...` param — tRPC v11 treats this as empty input
  // for no-input procedures. Mirror the pattern from src/services/api.ts
  // so the same helper handles both query-with-arg and query-without-arg.
  const serialized =
    input !== undefined ? superjson.serialize(input) : undefined;
  let url = `${TRPC}/${path}`;
  if (serialized !== undefined) {
    url += `?input=${encodeURIComponent(
      JSON.stringify({ json: serialized.json, meta: serialized.meta }),
    )}`;
  }
  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      err?.error?.json?.message || err?.error?.message || `Request failed: ${res.status}`,
    );
  }
  const json = await res.json();
  const data = json?.result?.data;
  if (data && typeof data === "object" && "json" in data) {
    return superjson.deserialize(data) as T;
  }
  return data as T;
}

async function postTrpc<T>(path: string, input?: unknown): Promise<T> {
  // Defensive: today only `admin.grant` calls this and always passes input,
  // but matching the GET-helper contract keeps the surface uniform.
  // For a future no-input mutation, omit the body entirely (tRPC v11
  // treats an empty POST as no-input).
  const serialized =
    input !== undefined ? superjson.serialize(input) : undefined;
  const fetchInit: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
  };
  if (serialized !== undefined) {
    fetchInit.body = JSON.stringify({
      json: serialized.json,
      meta: serialized.meta,
    });
  }
  const res = await fetch(`${TRPC}/${path}`, fetchInit);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      err?.error?.json?.message || err?.error?.message || `Request failed: ${res.status}`,
    );
  }
  const json = await res.json();
  const data = json?.result?.data;
  if (data && typeof data === "object" && "json" in data) {
    return superjson.deserialize(data) as T;
  }
  return data as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error || text;
    } catch {
      /* keep raw text */
    }
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface UserSummary {
  id: string;
  telegramId: string;
  name: string | null;
  username: string | null;
  paidAnalyses: number;
  level: number;
  subscriptionEnd: string | null;
}

export interface UserDetails {
  id: string;
  telegramId: string;
  name: string | null;
  username: string | null;
  freeAnalyses: number;
  paidAnalyses: number;
  freeChatQuestions: number;
  streakFreezes: number;
  proTrialUntil: string | null;
  monthStreakBadge: boolean;
  subscriptionEnd: string | null;
  level: number;
  xp: number;
  subscription: {
    status: string;
    type: string;
    endDate: string | null;
  } | null;
  rituals: {
    streak: number;
    maxStreak: number;
    weeklyStreak: number;
    nextAnalysisDate: string | null;
  } | null;
}

export interface AdminGrantRow {
  id: string;
  adminTelegramId: string;
  targetUserId: string;
  kind: string;
  amount: number;
  reason: string | null;
  createdAt: string;
  target: {
    id: string;
    telegramId: string;
    name: string | null;
    username: string | null;
  };
}

export const adminApi = {
  status: () =>
    callTrpc<{ enabled: boolean; errorMessage: string }>("admin.status"),
  login: (secret: string) =>
    postJson<{ ok: boolean; expiresInSeconds?: number }>(
      "/api/admin/login",
      { secret },
    ),
  logout: () => postJson<{ ok: boolean }>("/api/admin/logout", {}),
  searchUsers: (data: { query: string }) =>
    callTrpc<UserSummary[]>("admin.searchUsers", data),
  getUserDetails: (data: { id: string }) =>
    callTrpc<UserDetails | null>("admin.getUserDetails", data),
  grant: (data: {
    targetUserId: string;
    kind:
      | "paidAnalyses"
      | "freeChatQuestions"
      | "streakFreeze"
      | "subscriptionDays"
      | "proTrialDays"
      | "xp";
    amount: number;
    reason?: string;
  }) =>
    postTrpc<{
      grant: { id: string; createdAt: string | Date };
      target: { id: string; telegramId: string; name: string | null };
      kindLabel: string;
    }>("admin.grant", data),
  listGrants: (data: { limit: number }) =>
    callTrpc<AdminGrantRow[]>("admin.listGrants", data),
};
