"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import { api, type AchievementListResult } from "@/services/api";
import { CardSkeleton } from "@/components/ui/Skeleton";

interface AchievementsModalProps {
  open: boolean;
  onClose: () => void;
}

const ACHIEVEMENT_ICONS: Record<string, string> = {
  first_analysis: "П",
  week_streak: "Н",
  month_streak: "М",
  five_referrals: "5",
  level_10: "10",
  level_25: "25",
  xp_100: "100",
};

export const AchievementsModal: React.FC<AchievementsModalProps> = ({ open, onClose }) => {
  const [data, setData] = useState<AchievementListResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.achievement.list()
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 300,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{
              background: "white",
              width: "100%",
              maxWidth: 430,
              borderRadius: "24px 24px 0 0",
              padding: "24px 20px 32px",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>Достижения</h3>
                {data && (
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    +{data.totalXpFromAchievements} XP получено
                  </span>
                )}
              </div>
              <button onClick={onClose}>
                <CloseIcon size={22} />
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data?.achievements.map((ach, i) => (
                  <motion.div
                    key={ach.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3"
                    style={{
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "var(--bg)",
                      opacity: ach.unlocked ? 1 : 0.45,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: ach.unlocked ? "var(--primary-light)" : "var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        fontWeight: 700,
                        color: ach.unlocked ? "var(--primary-dark)" : "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {ACHIEVEMENT_ICONS[ach.key] || ach.title.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                        {ach.title}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {ach.description}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {ach.unlocked ? (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#7EC4D8",
                            background: "rgba(168, 216, 234, 0.15)",
                            padding: "2px 8px",
                            borderRadius: 8,
                          }}
                        >
                          +{ach.xpReward} XP
                        </div>
                      ) : (
                        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>🔒</span>
                      )}
                      {ach.unlockedAt && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {new Date(ach.unlockedAt).toLocaleDateString("ru-RU")}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
