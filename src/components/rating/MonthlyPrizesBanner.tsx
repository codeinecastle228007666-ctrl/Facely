"use client";

import React from "react";
import { motion } from "framer-motion";

/**
 * 2026-06-28 — Static info-card explaining the monthly Top-1 prize.
 * Rendered above the leaderboard sub-tabs on /rating. Self-contained
 * (no client queries needed) so it loads even when the leaderboard
 * itself is still fetching and there are zero rows in the ranking.
 *
 * Prize source-of-truth: `lib/pricing.ts` → pack5 = 5 analyses at
 * 399 ₽ / 280 ⭐. We hard-code the count here intentionally: this
 * banner copy is the user-facing promise, and the payout grant also
 * hardcodes `PAYOUT_ANALYSES = 5` in `monthlyWinnerService.ts`. If
 * the prize changes, update BOTH together.
 */
export const MonthlyPrizesBanner: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background:
          "linear-gradient(135deg, rgba(255, 215, 0, 0.10) 0%, rgba(126, 196, 216, 0.08) 100%)",
        border: "1px solid rgba(255, 215, 0, 0.25)",
        borderRadius: 16,
        padding: "14px 16px",
        marginBottom: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Декоративный «козырёк» сверху, чтобы баннер читался как
          особый блок, а не как часть общего потока карточек. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -22,
          right: -22,
          width: 78,
          height: 78,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255, 215, 0, 0.22) 0%, rgba(255, 215, 0, 0) 70%)",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 26,
            lineHeight: 1,
            flexShrink: 0,
          }}
          aria-hidden
        >
          🏆
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text)",
            lineHeight: 1.3,
          }}
        >
          Топ-1 рейтинга рефералов получает 5&nbsp;анализов в&nbsp;подарок
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          position: "relative",
        }}
      >
        Каждое 1-е число месяца вручаем{" "}
        <span style={{ fontWeight: 600 }}>pack&nbsp;5 анализов</span>{" "}
        (≈ 399&nbsp;₽ / 280&nbsp;⭐) пользователю, который привёл больше
        всего друзей в уходящем месяце.
        <br />
        Чем больше активных рефералов ты пригласишь — тем выше шансы
        забрать приз 👇
      </div>

      {/* Тонкая «progress-bar»-метафора: визуальный якорь, чтобы
          число анализов запоминалось, а не терялось в потоке копирайта.
          5 квадратиков — 5 анализов, в живой версии можно будет
          закрашивать по «заработанным» анализам в следующих итерациях. */}
      <div
        aria-hidden
        style={{
          display: "flex",
          gap: 4,
          marginTop: 10,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background:
                "linear-gradient(90deg, #FFD700 0%, #FFA500 100%)",
              boxShadow: "0 1px 2px rgba(255, 165, 0, 0.25)",
            }}
          />
        ))}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 6,
          fontStyle: "italic",
        }}
      >
        Призы вручаются автоматически 1-го числа каждого месяца в 04:00 МСК.
      </div>
    </motion.div>
  );
};
