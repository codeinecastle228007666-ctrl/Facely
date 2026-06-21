"use client";

import React, { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { api, type LeaderboardEntry } from "@/services/api";
import { motion } from "framer-motion";

type Tab = "referrers" | "streaks" | "level";

const TABS: { key: Tab; label: string }[] = [
  { key: "referrers", label: "Рефералы" },
  { key: "streaks", label: "Стрики" },
  { key: "level", label: "Уровень" },
];

const TAB_QUERIES: Record<Tab, () => Promise<LeaderboardEntry[]>> = {
  referrers: () => api.leaderboard.topReferrers(),
  streaks: () => api.leaderboard.topStreaks(),
  level: () => api.leaderboard.topLevel(),
};

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("referrers");
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTab = async (t: Tab) => {
    setTab(t);
    setLoading(true);
    try {
      const res = await TAB_QUERIES[t]();
      setData(res);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadTab("referrers");
  }, []);

  const getMedal = (rank: number): string | null => {
    if (rank === 1) return "\u{1F947}";
    if (rank === 2) return "\u{1F948}";
    if (rank === 3) return "\u{1F949}";
    return null;
  };

  return (
    <div style={{ paddingTop: 8, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Лидерборд</h1>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => loadTab(t.key)}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 14,
              border: "none",
              background: tab === t.key ? "var(--primary)" : "var(--bg-card)",
              color: tab === t.key ? "white" : "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card flex items-center"
              style={{
                padding: "12px 16px",
                background: entry.isMe ? "rgba(232, 160, 180, 0.08)" : "var(--bg-card)",
                border: entry.isMe ? "2px solid var(--primary)" : "2px solid transparent",
              }}
            >
              <div style={{ width: 32, textAlign: "center", fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>
                {getMedal(entry.rank) || `#${entry.rank}`}
              </div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: entry.isMe ? 600 : 400 }}>
                {entry.name || "Пользователь"}
                {entry.isMe && <span style={{ fontSize: 10, color: "var(--primary)", marginLeft: 6 }}>(вы)</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary-dark)" }}>
                {entry.value}
              </div>
            </motion.div>
          ))}
          {data.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)", fontSize: 14 }}>
              Нет данных для отображения
            </div>
          )}
        </div>
      )}

      <TabBar />
    </div>
  );
}
