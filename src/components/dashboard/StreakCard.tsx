"use client";

import React from "react";
import { StreakIcon } from "@/components/ui/Icons";
import { motion } from "framer-motion";

interface StreakCardProps {
  streak: number;
  maxStreak: number;
}

const MILESTONE_EMOJIS: Record<number, string> = {
  3: "🌟",
  7: "🔥",
  14: "💎",
  30: "👑",
};

export const StreakCard: React.FC<StreakCardProps> = ({ streak, maxStreak }) => {
  const nearestMilestone = [3, 7, 14, 30].find((m) => streak < m) || 30;

  return (
    <motion.div
      className="card flex items-center justify-between"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: "rgba(255, 209, 102, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <StreakIcon size={22} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {streak > 0 ? (
              <>Вы на пути {streak} дней подряд!</>
            ) : (
              <>Начните свой ритуал ухода</>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {streak > 0
              ? `До следующей цели ${nearestMilestone - streak} дней ${MILESTONE_EMOJIS[nearestMilestone] || ""}`
              : "Сделайте первый анализ"}
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--primary-dark)",
        }}
      >
        {streak}
      </div>
    </motion.div>
  );
};
