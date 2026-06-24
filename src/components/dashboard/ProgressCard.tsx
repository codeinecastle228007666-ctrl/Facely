"use client";

import React from "react";
import { motion } from "framer-motion";

interface ProgressCardProps {
  totalAnalyses: number;
  lastSkinType?: string | null;
  lastAnalysisDate?: string | null;
}

const RECOMMENDED = 2;
const MILESTONES = [1, 3, 5, 10, 25, 50, 100];

function getNextMilestone(count: number): number | null {
  return MILESTONES.find((m) => count < m) || null;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({ totalAnalyses, lastSkinType, lastAnalysisDate }) => {
  const nextMilestone = getNextMilestone(totalAnalyses);

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      style={{ display: "flex", alignItems: "center", gap: 14 }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: 14,
          background: "rgba(168, 216, 234, 0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
        }}
      >
        📊
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {totalAnalyses === 0 ? "Добро пожаловать!" : `${totalAnalyses} ${totalAnalyses === 1 ? "анализ" : totalAnalyses < 5 ? "анализа" : "анализов"}`}
          </span>
          {lastSkinType && (
            <span style={{ fontSize: 11, padding: "1px 10px", borderRadius: 12, background: "var(--primary-light)", color: "var(--primary-dark)", fontWeight: 500 }}>
              {lastSkinType}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {totalAnalyses === 0 ? (
            "Сделайте первый анализ кожи, чтобы начать"
          ) : nextMilestone ? (
            `До цели ${nextMilestone} анализов: осталось ${nextMilestone - totalAnalyses}`
          ) : (
            "Цель 100 анализов достигнута! 🎉"
          )}
        </div>
      </div>
      {totalAnalyses > 0 && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--primary-dark)" }}>
            {totalAnalyses}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            всего
          </div>
        </div>
      )}
    </motion.div>
  );
};
