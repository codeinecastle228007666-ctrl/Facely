"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type UserProfile } from "@/services/api";

function getTelegramInfo() {
  if (typeof window === "undefined") return null;
  const tg = (window as any).Telegram?.WebApp;
  return tg?.initDataUnsafe?.user ?? null;
}

/**
 * 2026-06-26 Phase 1.5 — strip leading "@" from Telegram username so
 * the server stores a consistent "ivanov" (not "@ivanov"). Telegram
 * itself usually hands us the bare handle, but some clients prepend @.
 * Note: even with this, returning users' usernames get synced through
 * the server-side `auth.me()` path; this client-side strip just makes
 * sure `register()` matches what server stores.
 */
function normalizeUsername(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/^@+/, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function useUser() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const waitForTelegram = useCallback((): Promise<any> => new Promise((resolve) => {
    const check = () => {
      const u = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      if (u) resolve(u);
      else setTimeout(check, 100);
    };
    setTimeout(() => resolve(null), 3000);
    check();
  }), []);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);

      // Wait for Telegram WebApp before making any API call
      const tgUser = getTelegramInfo() || (await waitForTelegram());
      if (!tgUser) {
        setError("No Telegram user found");
        return;
      }

      const data = await api.auth.me();
      setUser(data);
      setError(null);
    } catch {
      const tgUser = getTelegramInfo();
      if (tgUser) {
        try {
          const tg = (window as any)?.Telegram?.WebApp?.initDataUnsafe || {};
          const sp = tg.start_param || "";
          const fullUrl = window.location.href;
          const search = window.location.search;
          const urlParam = new URLSearchParams(search).get("startapp") || new URLSearchParams(search).get("ref") || "";
          const startParam = sp || urlParam;
          const referrerId = startParam && /^\d{5,}$/.test(startParam) ? startParam : undefined;
          // 2026-06-26 Phase 1.5 — pass @username on register so admin
          // can match bank comments to user even before the me() sync
          // catches up. (For brand-new users there's no DB row yet, so
          // this is the only write path.)
          const data = await api.auth.register({
            telegramId: String(tgUser.id),
            name: tgUser.first_name,
            username: normalizeUsername(tgUser.username),
            referrerId,
          });
          setUser(data);
          setError(null);
        } catch (regErr) {
          setError(regErr instanceof Error ? regErr.message : "Registration failed");
        }
      } else {
        setError("No Telegram user found");
      }
    } finally {
      setLoading(false);
    }
  }, [waitForTelegram]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { user, loading, error, refetch: fetchUser };
}
