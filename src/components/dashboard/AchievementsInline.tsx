"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { api, type AchievementListResult } from "@/services/api";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface AchievementsInlineProps {
  onViewAll?: () => void;
}

type Status = "loading" | "error" | "ready";

export const AchievementsInline: React.FC<AchievementsInlineProps> = ({ onViewAll }) => {
  const [data, setData] = useState<AchievementListResult | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.achievement.list();
      setData(res);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Берём в первую очередь ачивки с прогрессом, чтобы их было видно «в работе».
  const visible = (() => {
    const items = data?.achievements || [];
    const withProgress = items.filter((a) => a.progress).slice(0, 4);
    if (withProgress.length > 0) return withProgress;
    return items.slice(0, 4);
  })();

  return (
    <div
      className="card"
      style={{
        marginBottom: 12,
        padding: 14,
        background: "var(--bg-card)",
      }}
    >
      <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Достижения</span>
        </div>
        {onViewAll && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewAll();
            }}
            style={{
              fontSize: 12,
              color: "var(--primary-dark)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              padding: "4px 6px",
            }}
          >
            Все →
          </button>
        )}
      </div>

      {status === "loading" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 84,
                borderRadius: 12,
                background: "var(--bg)",
                opacity: 0.55,
              }}
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            textAlign: "center",
            padding: "16px 8px",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          Не удалось загрузить достижения.{" "}
          <button
            onClick={load}
            style={{
              fontSize: 13,
              color: "var(--primary-dark)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Повторить
          </button>
        </div>
      )}

      {status === "ready" && visible.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "20px 8px",
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          🎯 Делай анализы и приглашай друзей — открывай достижения
        </div>
      )}

      {status === "ready" && visible.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          {visible.map((a, i) => {
            const pct = a.progress
              ? Math.min(
                  100,
                  Math.round((a.progress.current / a.progress.target) * 100),
                )
              : a.unlocked
              ? 100
              : 0;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={onViewAll}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  background: a.unlocked
                    ? "rgba(168, 216, 234, 0.18)"
                    : "var(--bg)",
                  border: a.unlocked
                    ? "2px solid #A8D8EA"
                    : "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{a.icon}</span>
                  {a.unlocked && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#7EC4D8" }}>
                      ✓
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    marginBottom: 3,
                    lineHeight: 1.2,
                  }}
                >
                  {a.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginBottom: 6,
                    lineHeight: 1.2,
                  }}
                >
                  {a.progress
                    ? `${a.progress.current}/${a.progress.target}`
                    : a.unlocked
                    ? `+${a.xpReward} XP`
                    : "🔒"}
                </div>
                <ProgressBar
                  value={pct}
                  color={a.unlocked ? "#7EC4D8" : "#A8D8EA"}
                  height={5}
                />
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
