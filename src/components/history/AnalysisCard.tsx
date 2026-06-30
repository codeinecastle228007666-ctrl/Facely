"use client";

import React from "react";
import { motion } from "framer-motion";
import type { AnalysisHistoryItem } from "@/services/api";
import { pluralRu } from "@/lib/pluralRu";

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
  // 2026-06-30 — Thumbnail is back. Server-side resized 256px JPEG (~5KB
  // base64), painted into the 64×64 card preview. Falls back to the
  // mood-coloured gradient + skinType letter for legacy rows whose
  // `photoBase64` is null (rare since the schema is always populated
  // post-migration, but `generateThumbnail` returns null in that case).
  // `loading="lazy"` defers off-screen thumbnails; `decoding="async"`
  // keeps JPEGs off the main decode thread so the React tree paints first.
  const mood = (item.result as any)?.mood as
    | "позитивный"
    | "нейтральный"
    | "тревожный"
    | undefined;
  const MOOD_GRADIENTS: Record<string, string> = {
    позитивный: "linear-gradient(135deg, #C8E6F0 0%, #A8D8EA 100%)",
    нейтральный: "linear-gradient(135deg, #FAD7CC 0%, #F5C4B0 100%)",
    тревожный: "linear-gradient(135deg, #F5B8C6 0%, #E8A0B4 100%)",
  };
  const thumbBg = mood ? MOOD_GRADIENTS[mood] : "var(--bg)";

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
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 14,
          flexShrink: 0,
          overflow: "hidden",
          background: thumbBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 22,
          fontWeight: 600,
          textShadow: "0 1px 2px rgba(0,0,0,0.1)",
        }}
      >
        {item.photoThumbnail ? (
          <img
            src={`data:image/jpeg;base64,${item.photoThumbnail}`}
            alt="фото анализа"
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          item.skinType?.charAt(0)?.toUpperCase() || "•"
        )}
      </div>

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
              {problems.length} {pluralRu(problems.length, ["проблема", "проблемы", "проблем"])}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};
