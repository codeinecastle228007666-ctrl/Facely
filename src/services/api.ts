import superjson from "superjson";

const BASE = "/api/trpc";

function getTelegramInitData(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // Production: HMAC-verifiable initData from Telegram Mini App.
  // Contains user info signed with bot token; server validates signature.
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initData) return tg.initData as string;
  return undefined;
}

function getTelegramId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // Production: Telegram Mini App
  const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  if (user) return String(user.id);
  // Dev fallback: URL param or localStorage
  const params = new URLSearchParams(window.location.search);
  const tid = params.get("__tid");
  if (tid) return tid;
  return localStorage.getItem("__tid") || undefined;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {};
  // Always prefer initData when available — server validates HMAC.
  const initData = getTelegramInitData();
  if (initData) {
    h["x-telegram-init-data"] = initData;
    return h;
  }
  // Dev/staging fallback only: raw telegram id (server trusts this only when
  // NODE_ENV !== "production" OR ALLOW_DEV_AUTH=true).
  const tid = getTelegramId();
  if (tid) h["x-telegram-id"] = tid;
  return h;
}

async function query<T>(path: string, input?: unknown): Promise<T> {
  const serialized = input !== undefined ? superjson.serialize(input) : undefined;

  let url = `${BASE}/${path}`;
  if (serialized) {
    url += `?input=${encodeURIComponent(JSON.stringify({ json: serialized.json, meta: serialized.meta }))}`;
  }

  const res = await fetch(url, { method: "GET", headers: headers() });

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
  return (data ?? json) as T;
}

async function mutation<T>(path: string, input?: unknown): Promise<T> {
  const serialized = input !== undefined ? superjson.serialize(input) : undefined;

  const body = serialized
    ? JSON.stringify({ json: serialized.json, meta: serialized.meta })
    : undefined;

  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body,
  });

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
  return (data ?? json) as T;
}

export const api = {
  auth: {
    // 2026-06-26 Phase 1.5 — register now accepts Telegram @username so
    // admin can match manual card-transfer receipts to the user via
    // bank-comment grep. (Server-side, every subsequent `me()` also
    // syncs it from the HMAC-verified initData — this is just just for
    // brand-new users who haven't been seen yet.)
    register: (data: { telegramId: string; name?: string; username?: string; referrerId?: string }) =>
      mutation<UserProfile>("auth.register", data),
    me: () => query<UserProfile>("auth.me"),
  },
  analysis: {
    analyze: (data: { photoBase64: string; description?: string }) =>
      mutation<AnalyzeResponse>("analysis.analyze", data),
    history: (data?: { limit?: number; offset?: number }) =>
      query<{ analyses: AnalysisHistoryItem[]; total: number }>("analysis.history", data),
    getComparison: (data: { analysis1Id: string; analysis2Id: string }) =>
      query<ComparisonResult>("analysis.getComparison", data),
  },
  ritual: {
    getStreak: () =>
      query<{ streak: number; maxStreak: number; lastDate: string | null; weeklyStreak: number; nextAnalysisDate: string | null }>("ritual.getStreak"),
    getWeeklyStreak: () =>
      query<WeeklyStreakResult>("ritual.getWeeklyStreak"),
  },
  subscription: {
    prices: () =>
      query<{
        analysis: number;
        pack5: number;
        monthly: number;
        chat: number;
        currency: string;
        isStars: boolean;
      }>("subscription.prices"),
    status: () => query<SubscriptionStatus>("subscription.status"),
    activate: (data: { type: "trial" | "paid" }) =>
      mutation<unknown>("subscription.activate", data),
    purchaseAnalysis: (data: { quantity: number }) =>
      mutation<PurchaseResult>("subscription.purchaseAnalysis", data),
    purchaseSubscription: () =>
      mutation<PurchaseResult>("subscription.purchaseSubscription"),
    // 2026-06-26 — tier-based (single | pack5 | monthly). Monthly via
    // Stars is implemented as a one-time payment that internally activates
    // a 30-day Subscription (Telegram Stars do NOT support recurring).
    createStarsInvoice: (data: { tier: "single" | "pack5" | "monthly" }) =>
      mutation<{ url: string; currency: string; amount: number; tier: string }>(
        "subscription.createStarsInvoice",
        data,
      ),
    createChatStarsInvoice: () =>
      mutation<{ url: string; currency: string; amount: number }>("subscription.createChatStarsInvoice"),
    // 2026-06-26 Phase 1.5 — клиент больше не передаёт amount (берётся
    // server-side из PRICES.RUB[tier]). Новые параметры:
    //   • previewCardTransfer(tier) → возвращает ref ДО перевода;
    //     юзер видит его сразу при клике «Картой» и копирует в комментарий
    //     банковского перевода.
    //   • reportCardTransfer({ tier, expectedReference, submittedReference?,
    //     screenshotBase64? }) — ищет драфт по expectedReference и
    //     атомарно переводит в "submitted", нотифицируя admin ровно один раз.
    previewCardTransfer: (data: { tier: "single" | "pack5" | "monthly" | "fifteen" }) =>
      mutation<{ success: true; expectedReference: string; amount: number; tier: string }>(
        "subscription.previewCardTransfer",
        data,
      ),
    reportCardTransfer: (data: {
      tier: "single" | "pack5" | "monthly" | "fifteen";
      expectedReference?: string;
      submittedReference?: string;
      screenshotBase64?: string;
    }) =>
      mutation<{ success: boolean; expectedReference?: string; error?: string }>(
        "subscription.reportCardTransfer",
        data,
      ),
  },
  referral: {
    claimBonus: () => mutation<boolean>("referral.claimBonus"),
    getReferralStats: () => query<ReferralStatsResult>("referral.getReferralStats"),
  },
  report: {
    list: () => query<ReportItem[]>("report.list"),
    generate: () => mutation<ReportItem | null>("report.generate"),
  },
  chat: {
    getMessages: () => query<ChatMessageResult[]>("chat.getMessages"),
    sendMessage: (data: { content: string }) =>
      mutation<{ response: string; remaining: number }>("chat.sendMessage", data),
    clearHistory: () => mutation<{ deleted: number }>("chat.clearHistory"),
  },
  achievement: {
    list: () => query<AchievementListResult>("achievement.list"),
  },
  routine: {
    get: () => query<RoutineResult | null>("routine.get"),
    save: (data: {
      steps: { inventoryId?: string; productName: string; timeOfDay: string; dayOfWeek?: number | null; stepOrder: number }[];
    }) => mutation<RoutineResult | null>("routine.save", data),
    removeStep: (data: { stepId: string }) =>
      mutation<RoutineResult | null>("routine.removeStep", data),
  },
  inventory: {
    list: () => query<InventoryItem[]>("inventory.list"),
    add: (data: { name?: string; brand?: string; ingredients?: string; source: "manual" | "link" | "photo" | "barcode"; sourceUrl?: string; imageBase64?: string }) =>
      mutation<InventoryItem>("inventory.add", data),
    update: (data: { id: string; name?: string; brand?: string; ingredients?: string }) =>
      mutation<InventoryItem>("inventory.update", data),
    remove: (data: { id: string }) =>
      mutation<{ success: boolean }>("inventory.remove", data),
  },
  leaderboard: {
    topReferrers: () => query<LeaderboardEntry[]>("leaderboard.topReferrers"),
    topStreaks: () => query<LeaderboardEntry[]>("leaderboard.topStreaks"),
    topLevel: () => query<LeaderboardEntry[]>("leaderboard.topLevel"),
  },
};

export interface ProductLink {
  name: string;
  reason: string;
  effect: string;
}

/**
 * 2026-06-25 — `ProblemPosition` interface and the `problem_positions`
 * field on `AnalysisResult` were rolled back (Groq vision misclassified
 * nostrils / lips as inflammation). Removed to keep the type surface
 * honest rather than carrying a dead field.
 */

export interface AnalysisResult {
  skin_type: string;
  skin_score: number;
  problems: string[];
  recommendations: string[];
  daily_routine: string;
  mood: "позитивный" | "нейтральный" | "тревожный";
  product_links: ProductLink[];
  /**
   * 2026-06-25 — surfaced so the UI can render an honest degraded-mode
   * banner. "full" means Face++ was used (16 features, confidence
   * gating, trusted score). "partial" means the HuggingFace fallback
   * was used (only acne/spot/mole/wrinkle, no skin_type, no pore,
   * no dark_circle) — skin_score will be biased upward because
   * HF-undetected features stay at zero confidence.
   *
   * 2026-06-25 evening (dual-mode): "invalid" means the provider
   * returned HTTP 200 but the feature bag was all-zero / near-zero
   * (likely a stub or cached response). Orchestrator silently drops
   * these from `variants` so they never reach the user.
   */
  data_quality?: "full" | "partial" | "invalid";
  /**
   * 2026-06-25 evening (dual-mode). Optional map of per-provider
   * results. When present, ResultModal renders a tab switcher so the
   * user can pick which provider's verdict to trust. Older single-mode
   * records simply omit this field — UI gracefully falls back to the
   * top-level (dominant) skin_type / problems / skin_score fields.
   */
  variants?: {
    faceplus?: AnalysisResult;
    gemini?: AnalysisResult;
    huggingface?: AnalysisResult;
  };
  /**
   * Which entry in `variants` is mirrored by the top-level fields.
   * UI defaults its tab to this provider before the user explicitly
   * switches tabs.
   */
  activeProvider?: "faceplus" | "gemini" | "huggingface";
}

export interface AnalyzeResponse {
  analysis: AnalysisResult;
  /**
   * Jun-25: which provider produced this analysis. Surfaced so the
   * client can route UI affordances accordingly (e.g. hide daily
   * routine in some cases). Currently informational only.
   *
   * 2026-06-26: union extended to include "gemini" for the new
   * Google Gemini 2.5 Pro Vision provider. "dual" semantics unchanged:
   * at least 2 providers ran successfully.
   */
  provider?: "faceplus" | "gemini" | "huggingface" | "dual";
  xpGained: number;
  totalXp: number;
  level: number;
  streak: number;
  maxStreak: number;
  cached: boolean;
  cachedAt?: string;
}

export interface AnalysisHistoryItem {
  id: string;
  photoUrl: string | null;
  skinType: string | null;
  /**
   * 2026-06-25 evening — top-level "dual" when both providers ran
   * and both passed the bogus-gate. 2026-06-26 — union extended to
   * include "gemini" for the new parallel provider.
   */
  provider: "faceplus" | "gemini" | "huggingface" | "dual" | null;
  result: AnalysisResult | null;
  isFree: boolean;
  createdAt: string;
}

export interface SubscriptionStatus {
  active: boolean;
  type: string | null;
  endDate: string | null;
  daysLeft: number;
}

export interface PurchaseResult {
  quantity?: number;
  xpGained: number;
  totalXp: number;
  level: number;
}

export interface WeeklyStreakResult {
  weeklyStreak: number;
  nextAnalysisDate: string | null;
  daysUntilNext: number;
  canAnalyze: boolean;
}

export interface ComparisonResult {
  analysis1: {
    id: string;
    date: string;
    result: any;
    skinType: string | null;
    photoBase64: string | null;
    /** 2026-06-25 evening — surfaced so the comparison view can flag the provider.
     *  2026-06-26: union extended with "gemini" for the new parallel provider. */
    provider: "faceplus" | "gemini" | "huggingface" | "dual" | null;
  };
  analysis2: {
    id: string;
    date: string;
    result: any;
    skinType: string | null;
    photoBase64: string | null;
    provider: "faceplus" | "gemini" | "huggingface" | "dual" | null;
  };
  differences: Record<string, { from: number; to: number; diff: number; improved: boolean }>;
}

export interface ChatMessageResult {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  brand: string | null;
  ingredients: string | null;
  analysis: {
    key_ingredients: string[];
    benefits: string[];
    concerns: string[];
    safety_rating: "safe" | "caution" | "irritant";
    suitability: string;
  } | null;
  imageUrl: string | null;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
}

export interface AchievementItem {
  id: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  unlocked: boolean;
  unlockedAt: string | null;
  progress?: { current: number; target: number };
}

export interface AchievementListResult {
  achievements: AchievementItem[];
  totalXpFromAchievements: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string | null;
  value: number;
  rank: number;
  isMe: boolean;
}

export interface RoutineStepItem {
  id: string;
  inventoryId: string | null;
  productName: string;
  timeOfDay: string;
  dayOfWeek: number | null;
  stepOrder: number;
  inventory: { name: string; brand: string | null } | null;
}

export interface RoutineResult {
  id: string;
  steps: RoutineStepItem[];
}

export interface ReferralStatsResult {
  count: number;
  bonusEarned: number;
  leaderboardPosition: number | null;
  referredUsers: { name: string; joinedAt: string; bonusGiven: boolean }[];
}

export interface ReportItem {
  id: string;
  dynamics: Record<string, string> | null;
  summary: string | null;
  generatedAt: string;
}

export interface UserProfile {
  id: string;
  telegramId: string;
  name: string | null;
  // 2026-06-26 Phase 1.5 — Telegram @username (без "@" префикса).
  // Null если юзер скрыл username в настройках приватности.
  username: string | null;
  level: number;
  xp: number;
  freeAnalyses: number;
  paidAnalyses: number;
  freeChatQuestions: number;
  referralCount: number;
  subscriptionEnd: string | null;
  subscription: { status: string; type: string; endDate: string | null } | null;
  rituals: { streak: number; maxStreak: number; weeklyStreak: number; nextAnalysisDate: string | null } | null;
  _count: { analyses: number };
}
