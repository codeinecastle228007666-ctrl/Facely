import type { Metadata } from "next";
import "./globals.css";
import { OfflineBanner } from "@/components/ui/OfflineBanner";

export const metadata: Metadata = {
  title: "Facely — AI-анализ кожи",
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
      </head>
      <body>
        <OfflineBanner />
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
