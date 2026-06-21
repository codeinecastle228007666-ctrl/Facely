"use client";

import React from "react";
import { motion } from "framer-motion";

interface DynamicsSummaryProps {
  summary: string | null;
  dynamics: string | null;
}

export const DynamicsSummary: React.FC<DynamicsSummaryProps> = ({ summary, dynamics }) => {
  const icon = dynamics === "улучшение" ? "📈" : dynamics === "ухудшение" ? "📉" : "➡️";

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background:
              dynamics === "улучшение"
                ? "rgba(168, 216, 234, 0.15)"
                : dynamics === "ухудшение"
                  ? "rgba(232, 160, 180, 0.15)"
                  : "rgba(245, 196, 176, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {dynamics === "улучшение"
              ? "Прогресс заметен!"
              : dynamics === "ухудшение"
                ? "Есть над чем работать"
                : "Без изменений"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Динамика за неделю
          </div>
        </div>
      </div>

      {summary && (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>
          {summary}
        </p>
      )}
    </motion.div>
  );
};
