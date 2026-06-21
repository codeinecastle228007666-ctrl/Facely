"use client";

import React from "react";
import { motion } from "framer-motion";

interface DataPoint {
  label: string;
  value: number;
  mood?: string;
}

interface DynamicsChartProps {
  data: DataPoint[];
}

export const DynamicsChart: React.FC<DynamicsChartProps> = ({ data }) => {
  const max = Math.max(...data.map((d) => d.value), 10);
  const barColor = (mood?: string) => {
    switch (mood) {
      case "позитивный": return "#A8D8EA";
      case "нейтральный": return "#F5C4B0";
      case "тревожный": return "#E8A0B4";
      default: return "#F5C4B0";
    }
  };

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginBottom: 12 }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
        Динамика состояния кожи
      </h3>

      <div className="flex justify-between" style={{ alignItems: "flex-end", height: 120, gap: 6 }}>
        {data.map((point, i) => (
          <motion.div
            key={i}
            className="flex flex-col items-center"
            style={{ flex: 1, height: "100%", justifyContent: "flex-end", gap: 4 }}
          >
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${(point.value / max) * 100}%` }}
              transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
              style={{
                width: "100%",
                maxWidth: 32,
                borderRadius: "8px 8px 4px 4px",
                background: barColor(point.mood),
                minHeight: 8,
              }}
            />
            <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              {point.label}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="flex justify-between" style={{ marginTop: 16, gap: 12 }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "#A8D8EA" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Улучшение</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "#F5C4B0" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Стабильно</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "#E8A0B4" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Ухудшение</span>
        </div>
      </div>
    </motion.div>
  );
};
