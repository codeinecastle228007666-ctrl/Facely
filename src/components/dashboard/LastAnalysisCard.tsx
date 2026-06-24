"use client";

import React from "react";
import { motion } from "framer-motion";
import type { AnalysisHistoryItem } from "@/services/api";

interface LastAnalysisCardProps {
  item: AnalysisHistoryItem | null;
}

const MOOD_COLORS: Record<string, { bg: string; text: string }> = {
  позитивный: { bg: "rgba(168, 216, 234, 0.12)", text: "#7EC4D8" },
  нейтральный: { bg: "rgba(255, 180, 162, 0.12)", text: "#E89B87" },
  тревожный: { bg: "rgba(232, 160, 180, 0.12)", text: "#E07A8E" },
};

export const LastAnalysisCard: React.FC<LastAnalysisCardProps> = ({ item }) => {
  if (!item || !item.result) return null;

  const mood = item.result.mood;
  const mc = MOOD_COLORS[mood] || MOOD_COLORS.нейтральный;
  const daysAgo = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000);

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
            {daysAgo === 0 ? "Сегодня" : daysAgo === 1 ? "Вчера" : `${daysAgo} дня назад`}
          </span>
          {item.skinType && (
            <span style={{ fontSize: 11, padding: "1px 10px", borderRadius: 12, background: "var(--primary-light)", color: "var(--primary-dark)", fontWeight: 500 }}>
              {item.skinType}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {item.result.problems.length > 0
              ? `${item.result.problems.length} ${item.result.problems.length === 1 ? "проблема" : "проблем"}`
              : "Без проблем"}
          </span>
          <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 10, background: mc.bg, color: mc.text, fontWeight: 500 }}>
            {mood}
          </span>
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
