"use client";

import React from "react";
import { AvatarIcon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { LEVEL_THRESHOLDS } from "@/server/utils/levelSystem";
import { motion } from "framer-motion";

interface UserProfileProps {
  name: string | null;
  level: number;
  xp: number;
}

export const UserProfile: React.FC<UserProfileProps> = ({ name, level, xp }) => {
  const nextLevel = LEVEL_THRESHOLDS[level];
  const xpNeeded = nextLevel ? nextLevel.xpRequired - LEVEL_THRESHOLDS[level - 1].xpRequired : 0;
  const xpInLevel = xp - LEVEL_THRESHOLDS[level - 1].xpRequired;
  const progress = nextLevel ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 100;

  return (
    <motion.div
      className="card flex items-center gap-4"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ marginBottom: 12 }}
    >
      <AvatarIcon size={56} />
      <div style={{ flex: 1 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>
          {name || "Пользователь"}
        </h2>
        <span
          style={{
            fontSize: 12,
            color: "var(--primary-dark)",
            fontWeight: 500,
            background: "var(--primary-light)",
            padding: "2px 10px",
            borderRadius: 20,
            display: "inline-block",
            marginBottom: 8,
          }}
        >
          Уровень {level}
        </span>
        <div style={{ marginTop: 4 }}>
          <div className="flex justify-between text-sm" style={{ marginBottom: 4 }}>
            <span className="text-muted">XP до {level + 1} уровня</span>
            <span style={{ color: "var(--primary-dark)", fontWeight: 600 }}>
              {xp}/{nextLevel?.xpRequired || xp}
            </span>
          </div>
          <ProgressBar value={progress} color="var(--primary)" height={6} />
        </div>
      </div>
    </motion.div>
  );
};
