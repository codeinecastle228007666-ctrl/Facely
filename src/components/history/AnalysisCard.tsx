"use client";

import React from "react";
import { motion } from "framer-motion";
import type { AnalysisHistoryItem } from "@/services/api";

interface AnalysisCardProps {
  item: AnalysisHistoryItem;
  index: number;
  onClick?: () => void;
  showCheckbox?: boolean;
  checked?: boolean;
  onCheck?: () => void;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ item, index, onClick, showCheckbox, checked, onCheck }) => {
  const problems = (item.result as any)?.problems || [];
  const photoBase64 = (item as any).photoBase64;

  return (
    <motion.div
      className="card flex gap-3"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      style={{ marginBottom: 10, cursor: "pointer" }}
    >
      {photoBase64 && (
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            flexShrink: 0,
            overflow: "hidden",
            background: "var(--bg)",
          }}
        >
          <img
            src={`data:image/jpeg;base64,${photoBase64}`}
            alt="фото"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}
      {!photoBase64 && (
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            background: "var(--bg)",
            flexShrink: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="5" width="20" height="14" rx="3" fill="#F5D0DC" stroke="#E8A0B4" strokeWidth="1.2"/>
            <circle cx="12" cy="12" r="4" fill="white" stroke="#E8A0B4" strokeWidth="1"/>
            <path d="M17 5l-2-3H9L7 5" stroke="#E8A0B4" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
      )}

      {showCheckbox && (
        <div
          onClick={(e) => { e.stopPropagation(); onCheck?.(); }}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: checked ? "2px solid var(--primary)" : "2px solid var(--border)",
            background: checked ? "var(--primary)" : "transparent",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s",
            alignSelf: "center",
          }}
        >
          {checked && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}

      <div style={{ flex: 1 }}>
        <div className="flex justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {item.skinType || "Анализ кожи"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {new Date(item.createdAt).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
          {problems.length > 0
            ? problems.slice(0, 3).join(", ")
            : "Проблем не выявлено"}
        </div>

        <div className="flex gap-2">
          {item.isFree && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(168, 216, 234, 0.15)",
                color: "#7EC4D8",
                fontWeight: 500,
              }}
            >
              Бесплатно
            </span>
          )}
          {problems.length > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(255, 180, 162, 0.15)",
                color: "#E89B87",
                fontWeight: 500,
              }}
            >
              {problems.length} {problems.length === 1 ? "проблема" : problems.length < 5 ? "проблемы" : "проблем"}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};
