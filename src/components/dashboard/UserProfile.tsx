"use client";

import React from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { motion } from "framer-motion";

interface UserProfileProps {
  name: string | null;
  level: number;
  xp: number;
  frame?: string;
  badge?: string;
  referralCount?: number;
  onAchievementsClick?: () => void;
}

const FRAME_COLORS: Record<string, string> = {
  bronze: "linear-gradient(135deg, #CD7F32, #E8A87C)",
  silver: "linear-gradient(135deg, #C0C0C0, #E8E8E8)",
  gold: "linear-gradient(135deg, #FFD700, #FFC107)",
  platinum: "linear-gradient(135deg, #E5E4E2, #BCC6CC)",
  diamond: "linear-gradient(135deg, #B9F2FF, #7EC4D8)",
};

const BADGE_COLORS: Record<string, string> = {
  Новичок: "rgba(168, 216, 234, 0.15)",
  Исследователь: "rgba(255, 180, 162, 0.15)",
  Энтузиаст: "rgba(232, 160, 180, 0.15)",
  Знаток: "rgba(255, 215, 0, 0.1)",
  Эксперт: "rgba(168, 216, 234, 0.2)",
  Мастер: "rgba(255, 180, 162, 0.2)",
  Грандмастер: "rgba(232, 160, 180, 0.2)",
  Элита: "rgba(185, 242, 255, 0.2)",
  Легенда: "rgba(255, 215, 0, 0.2)",
  Миф: "rgba(255, 215, 0, 0.3)",
};

export const UserProfile: React.FC<UserProfileProps> = ({ name, level, xp, frame = "bronze", badge = "Новичок", referralCount = 0, onAchievementsClick }) => {
  const xpInLevel = xp - (level > 1 ? (level - 1) * (level - 1) * 10 : 0);
  const nextLevelXp = level * level * 10;
  const xpNeeded = nextLevelXp - (level > 1 ? (level - 1) * (level - 1) * 10 : 0);
  const progress = level >= 50 ? 100 : xpNeeded > 0 ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 100;

  return (
    <motion.div
      className="card flex items-center gap-4"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ marginBottom: 12, position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: FRAME_COLORS[frame] || FRAME_COLORS.bronze,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          padding: 3,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 700,
            color: "var(--primary-dark)",
          }}
        >
          {name?.[0]?.toUpperCase() || "?"}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name || "Пользователь"}
          </h2>
          {referralCount > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--bg)", padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>
              +{referralCount}
            </span>
          )}
          {onAchievementsClick && (
            <button
              onClick={(e) => { e.stopPropagation(); onAchievementsClick(); }}
              style={{
                marginLeft: "auto",
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "var(--bg)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              title="Ачивки"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4 21c0-4.5 3.5-8 8-8s8 3.5 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M17 3l2 2 3-3" stroke="#7EC4D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5" style={{ marginBottom: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 12,
              color: "var(--primary-dark)",
              fontWeight: 500,
              background: "var(--primary-light)",
              padding: "2px 10px",
              borderRadius: 20,
              whiteSpace: "nowrap",
            }}
          >
            Уровень {level}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 10px",
              borderRadius: 20,
              background: BADGE_COLORS[badge] || "var(--bg)",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        </div>
        <div style={{ marginTop: 4 }}>
          <div className="flex justify-between text-sm" style={{ marginBottom: 4 }}>
            <span className="text-muted">XP до {Math.min(level + 1, 50)} уровня</span>
            <span style={{ color: "var(--primary-dark)", fontWeight: 600 }}>
              {xpInLevel}/{xpNeeded}
            </span>
          </div>
          <ProgressBar value={progress} color={FRAME_COLORS[frame] || "var(--primary)"} height={6} />
        </div>
      </div>
    </motion.div>
  );
};
