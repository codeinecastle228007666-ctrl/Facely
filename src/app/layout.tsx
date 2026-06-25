import type { Metadata } from "next";
import "./globals.css";
import { OfflineBanner } from "@/components/ui/OfflineBanner";

export const metadata: Metadata = {
  title: "Reveli — AI-анализ кожи",
  description: "AI-анализ кожи и персональный уход",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" async />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#fef6f7" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.json" />
        <script>{`if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(() => {}) }`}</script>
      </head>
      <body>
        <OfflineBanner />
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
