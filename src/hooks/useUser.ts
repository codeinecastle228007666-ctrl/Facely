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

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.auth.me();
      setUser(data);
      setError(null);
    } catch {
      // Wait for Telegram WebApp to initialize
      const waitForTelegram = (): Promise<any> => new Promise((resolve) => {
        const check = () => {
          const u = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
          if (u) resolve(u);
          else setTimeout(check, 100);
        };
        setTimeout(() => resolve(null), 3000);
        check();
      });

      const tgUser = getTelegramInfo() || (await waitForTelegram());
      if (tgUser) {
        try {
          const data = await api.auth.register({
            telegramId: String(tgUser.id),
            name: tgUser.first_name,
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
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { user, loading, error, refetch: fetchUser };
}
