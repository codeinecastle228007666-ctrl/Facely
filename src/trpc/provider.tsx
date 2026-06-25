"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import { api } from "./client";
import superjson from "superjson";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          headers() {
            if (typeof window === "undefined") return {};
            const tg = (window as any).Telegram?.WebApp;

            // Prefer signed initData — server validates HMAC-SHA256 with BOT_TOKEN.
            if (tg?.initData) {
              return { "x-telegram-init-data": tg.initData as string };
            }

            // Dev/staging fallback: unverified telegram id from initDataUnsafe.
            // Server only trusts this when NODE_ENV !== "production" OR
            // ALLOW_DEV_AUTH=true.
            const telegramId = tg?.initDataUnsafe?.user?.id;
            if (telegramId) {
              const params = new URLSearchParams(window.location.search);
              const tidFromUrl = params.get("__tid");
              const tid =
                tidFromUrl ||
                (typeof window !== "undefined"
                  ? localStorage.getItem("__tid")
                  : null);
              if (tid) return { "x-telegram-id": String(tid) };
              return { "x-telegram-id": String(telegramId) };
            }
            return {};
          },
        }),
      ],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
