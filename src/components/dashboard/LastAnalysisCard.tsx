"use client";

import React from "react";
import { motion } from "framer-motion";
import type { AnalysisHistoryItem } from "@/services/api";
import { pluralRu } from "@/lib/pluralRu";

interface LastAnalysisCardProps {
  item: AnalysisHistoryItem | null;
}

const MOOD_COLORS: Record<string, { bg: string; text: string }> = {
  позитивный: { bg: "rgba(168, 216, 234, 0.12)", text: "#7EC4D8" },
  нейтральный: { bg: "rgba(255, 180, 162, 0.12)", text: "#E89B87" },
  тревожный: { bg: "rgba(232, 160, 180, 0.12)", text: "#E07A8E" },
};

// 2026-06-27 — Rich-title hardening. Earlier titles said simply
// "Состояние кожи вчера" (3 words, generic). User wanted 5+ words
// with concrete data. Title now embeds mood adjective + problem
// count so at-a-glance the user sees actual current skin state:
//   "Вчера кожа нейтральная, 2 проблемы"
//   "Сегодня кожа хорошая, без проблем"
// Subline that previously held problems count + mood chip is now
// redundant — emoji on the left already conveys mood at the icon
// level, so it's gone.
const MOOD_ADJECTIVE: Record<string, string> = {
  позитивный: "хорошая",
  нейтральный: "нормальная",
  тревожный: "плохая",
};

export const LastAnalysisCard: React.FC<LastAnalysisCardProps> = ({ item }) => {
  if (!item || !item.result) return null;

  const mood = item.result.mood;
  const mc = MOOD_COLORS[mood] || MOOD_COLORS.нейтральный;
  const daysAgo = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000);
  const adjective = MOOD_ADJECTIVE[mood] || "неопределённая";
  const problemsCount = item.result.problems.length;
  const problemsText =
    problemsCount > 0
      ? `${problemsCount} ${pluralRu(problemsCount, ["проблема", "проблемы", "проблем"])}`
      : "без проблем";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: 14,
          background: mc.bg, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
        }}
      >
        {mood === "позитивный" ? "😊" : mood === "тревожный" ? "😟" : "😐"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {daysAgo === 0
              ? `Сегодня кожа ${adjective}, ${problemsText}`
              : daysAgo === 1
                ? `Вчера кожа ${adjective}, ${problemsText}`
                : `${daysAgo} ${pluralRu(daysAgo, ["день", "дня", "дней"])} назад — кожа ${adjective}, ${problemsText}`}
          </span>
          {item.skinType && (
            <span style={{ fontSize: 11, padding: "1px 10px", borderRadius: 12, background: "var(--primary-light)", color: "var(--primary-dark)", fontWeight: 500 }}>
              {item.skinType}
            </span>
          )}
        </div>
      </div>
      {daysAgo === 0 && (
        <div style={{ fontSize: 10, padding: "3px 8px", borderRadius: 8, background: "rgba(126, 196, 216, 0.12)", color: "#7EC4D8", fontWeight: 600 }}>
          NEW
        </div>
      )}
    </motion.div>
  );
};
