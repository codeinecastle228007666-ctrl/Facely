"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type UserProfile } from "@/services/api";

function getTelegramInfo() {
  if (typeof window === "undefined") return null;
  const tg = (window as any).Telegram?.WebApp;
  return tg?.initDataUnsafe?.user ?? null;
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
          const data = await api.auth.register({
            telegramId: String(tgUser.id),
            name: tgUser.first_name,
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
