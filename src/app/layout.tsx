import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facely",
  description: "AI-анализ кожи и персональный уход",
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
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
