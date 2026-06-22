"use client";

import React, { useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { api, type AchievementItem, type AchievementListResult } from "@/services/api";
import { motion } from "framer-motion";
import { CardSkeleton } from "@/components/ui/Skeleton";

export default function AchievementsPage() {
  const [data, setData] = useState<AchievementListResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.achievement.list()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ paddingTop: 8, paddingBottom: 80 }}>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        style={{ marginBottom: 16 }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Достижения</h1>
        {data && (
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Получено XP: +{data.totalXpFromAchievements}
          </span>
        )}
      </motion.div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data?.achievements.map((ach, i) => (
            <motion.div
              key={ach.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card flex items-center gap-3"
              style={{
                padding: 14,
                opacity: ach.unlocked ? 1 : 0.45,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: ach.unlocked ? "var(--primary-light)" : "var(--bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                {ach.icon}
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
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--text-muted)",
                    }}
                  >
                    🔒
                  </div>
                )}
                {ach.unlockedAt && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    {new Date(ach.unlockedAt).toLocaleDateString("ru-RU")}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {data?.achievements.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)", fontSize: 14 }}>
              Достижения пока не доступны
            </div>
          )}
        </div>
      )}

      <TabBar />
    </div>
  );
}
