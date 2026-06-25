"use client";

import React from "react";
import { StreakIcon } from "@/components/ui/Icons";
import { motion } from "framer-motion";
import { pluralRu } from "@/lib/pluralRu";

interface StreakCardProps {
  streak: number;
  maxStreak: number;
  nextAnalysisDate?: string | null;
}

const MILESTONES: Record<number, string> = {
  2: "2 дня",
  4: "4 дня",
  8: "8 дней",
  12: "12 дней",
  24: "24 дня",
};

export const StreakCard: React.FC<StreakCardProps> = ({ streak, maxStreak }) => {
  const nearestMilestone = Object.entries(MILESTONES)
    .map(([days, label]) => ({ days: parseInt(days), label }))
    .find((m) => streak < m.days);

  return (
    <motion.div
      className="card flex items-center justify-between"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      style={{ marginBottom: 12 }}
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
              <>Вы на пути {streak} {pluralRu(streak, ["день", "дня", "дней"])} подряд!</>
            ) : (
              <>Регулярность — ключ к здоровой коже</>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {streak === 0
              ? "Делайте анализы регулярно для отслеживания прогресса"
              : nearestMilestone
              ? `До цели "${nearestMilestone.label}": ${nearestMilestone.days - streak} ${pluralRu(nearestMilestone.days - streak, ["день", "дня", "дней"])}`
              : "Цель достигнута!"}
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
