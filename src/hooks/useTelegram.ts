"use client";

import { useEffect, useState } from "react";

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  sendMessage: (text: string) => void;
  shareToStory: (mediaLink: string) => void;
  HapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export function useTelegram() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const u = tg.initDataUnsafe?.user;
      if (u) setUser(u);
      setReady(true);
    } else {
      setReady(true);
    }
  }, []);

  const impact = (style: "light" | "medium" | "heavy" = "medium") => {
    window.Telegram?.WebApp.HapticFeedback.impactOccurred(style);
  };

  const notify = (type: "error" | "success" | "warning") => {
    window.Telegram?.WebApp.HapticFeedback.notificationOccurred(type);
  };

  const share = (text: string) => {
    window.Telegram?.WebApp.sendMessage(text);
  };

  const close = () => {
    window.Telegram?.WebApp.close();
  };

  return { user, ready, impact, notify, share, close };
}
