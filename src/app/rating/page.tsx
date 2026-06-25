"use client";

import React, { useState, useEffect } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { ReferralStats } from "@/components/referral/ReferralStats";
import { ShareIcon } from "@/components/ui/Icons";
import { useTelegram } from "@/hooks/useTelegram";
import { api, type LeaderboardEntry, type ReferralStatsResult } from "@/services/api";
import { motion } from "framer-motion";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useUser } from "@/hooks/useUser";

type RatingTab = "top" | "friends";
type LeaderboardTab = "referrers" | "streaks" | "level";

const LEADERBOARD_TABS: { key: LeaderboardTab; label: string }[] = [
  { key: "referrers", label: "Рефералы" },
  { key: "streaks", label: "Стрики" },
  { key: "level", label: "Уровень" },
];

const TAB_QUERIES: Record<LeaderboardTab, () => Promise<LeaderboardEntry[]>> = {
  referrers: () => api.leaderboard.topReferrers(),
  streaks: () => api.leaderboard.topStreaks(),
  level: () => api.leaderboard.topLevel(),
};

export default function RatingPage() {
  const { user: tgUser, impact } = useTelegram();
  const { user } = useUser();
  const [ratingTab, setRatingTab] = useState<RatingTab>("top");
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("referrers");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [referralStats, setReferralStats] = useState<ReferralStatsResult | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const myId =
    user?.telegramId ||
    tgUser?.id?.toString() ||
    (typeof window !== "undefined" ? localStorage.getItem("__tid") : null) ||
    "";

  useEffect(() => {
    loadLeaderboard("referrers");
    loadReferralStats();
  }, []);

  const loadLeaderboard = async (tab: LeaderboardTab) => {
    setLeaderboardTab(tab);
    setLoading(true);
    try {
      const res = await TAB_QUERIES[tab]();
      setLeaderboard(res);
    } catch { setLeaderboard([]); }
    finally { setLoading(false); }
  };

  const loadReferralStats = () => {
    setReferralLoading(true);
    api.referral.getReferralStats()
      .then(setReferralStats)
      .catch(() => {})
      .finally(() => setReferralLoading(false));
  };

  const getMedal = (rank: number): string | null => {
    if (rank === 1) return "\u{1F947}";
    if (rank === 2) return "\u{1F948}";
    if (rank === 3) return "\u{1F949}";
    return null;
  };

  const handleShare = () => {
    impact("light");
    const botUsername = "Reveli_bot";
    const refCode = tgUser?.id || localStorage.getItem("__tid") || "";
    const refLink = `https://t.me/${botUsername}?start=${refCode}`;
    const text = `✨ Присоединяйся к Reveli — AI-анализ кожи и персональный уход!\n${refLink}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => prompt("Скопируйте ссылку:", text));
    } else {
      prompt("Скопируйте ссылку:", text);
    }
  };

  return (
    <>
      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
        {/* Segmented control */}
        <div style={{
          display: "flex",
          background: "var(--bg-card)",
          borderRadius: 16,
          padding: 4,
          marginBottom: 16,
          boxShadow: "var(--shadow)",
        }}>
          {[
            { key: "top" as RatingTab, label: "🏆 Топ", desc: "Рейтинг" },
            { key: "friends" as RatingTab, label: "👥 Друзья", desc: "Рефералы" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRatingTab(tab.key)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 13,
                border: "none",
                background: ratingTab === tab.key ? "var(--primary)" : "transparent",
                color: ratingTab === tab.key ? "white" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              <span>{tab.label}</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>{tab.desc}</span>
            </button>
          ))}
        </div>

        {ratingTab === "top" && (
          <>
            {/* Crown header */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                background: "rgba(255, 215, 0, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                border: "1px solid rgba(255, 215, 0, 0.15)",
              }}
            >
              <span style={{ fontSize: 20 }}>👑</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Лучшие пользователи этого месяца
              </span>
            </motion.div>

            {/* Leaderboard sub-tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {LEADERBOARD_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => loadLeaderboard(t.key)}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 12,
                    border: "none",
                    background: leaderboardTab === t.key ? "var(--primary-light)" : "var(--bg-card)",
                    color: leaderboardTab === t.key ? "var(--primary-dark)" : "var(--text-muted)",
                    fontSize: 11,
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
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {leaderboard.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="card flex items-center"
                    style={{
                      padding: "12px 14px",
                      background: entry.isMe ? "rgba(232, 160, 180, 0.08)" : "var(--bg-card)",
                      border: entry.isMe ? "2px solid var(--primary)" : "2px solid transparent",
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: entry.rank <= 3 ? "rgba(255, 215, 0, 0.12)" : "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: entry.rank <= 3 ? "#FFD700" : "var(--text-muted)", flexShrink: 0 }}>
                      {getMedal(entry.rank) || `#${entry.rank}`}
                    </div>
                    <div style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: entry.isMe ? 600 : 400 }}>
                      {entry.name || "Пользователь"}
                      {entry.isMe && <span style={{ fontSize: 10, color: "var(--primary)", marginLeft: 6 }}>(вы)</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--primary-dark)", fontSize: 14, fontWeight: 700 }}>
                      <span style={{ fontSize: 12 }}>🔥</span>
                      {entry.value}
                    </div>
                  </motion.div>
                ))}
                {leaderboard.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)", fontSize: 14 }}>
                    Нет данных для отображения
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {ratingTab === "friends" && (
          <>
            {referralLoading ? (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite" }} />
              </div>
            ) : (
              <ReferralStats
                invitedCount={referralStats?.count || 0}
                bonusAnalyses={referralStats?.bonusEarned || 0}
                onShare={handleShare}
                referredUsers={referralStats?.referredUsers}
              />
            )}
            {copied && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  position: "fixed",
                  bottom: 100,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--primary-dark)",
                  color: "white",
                  padding: "12px 24px",
                  borderRadius: 16,
                  fontSize: 14,
                  fontWeight: 500,
                  zIndex: 200,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                }}
              >
                Ссылка скопирована!
              </motion.div>
            )}
          </>
        )}
      </div>

      <TabBar />
    </>
  );
}
