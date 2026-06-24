"use client";

import React from "react";
import { GiftIcon, ShareIcon } from "@/components/ui/Icons";
import { motion } from "framer-motion";

interface ReferralStatsProps {
  invitedCount: number;
  bonusAnalyses: number;
  onShare: () => void;
  referredUsers?: { name: string; joinedAt: string; bonusGiven: boolean }[];
}

export const ReferralStats: React.FC<ReferralStatsProps> = ({
  invitedCount,
  bonusAnalyses,
  onShare,
  referredUsers,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <motion.div
        className="card flex items-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            background: "rgba(255, 180, 162, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GiftIcon size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Приглашено друзей</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Получено бонусов: +{bonusAnalyses} анализа
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--primary-dark)" }}>
          {invitedCount}
        </div>
      </motion.div>

      <motion.button
        className="card flex items-center gap-3"
        onClick={onShare}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          cursor: "pointer",
          border: "none",
          background: "var(--bg-card)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)",
          padding: 20,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            background: "rgba(200, 122, 143, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShareIcon size={24} />
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Поделиться ссылкой</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Приглашайте друзей и получайте бонусы
          </div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9 6l6 6-6 6" stroke="#C47A8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.button>

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}
      >
        <strong style={{ color: "var(--text)" }}>Как это работает:</strong>
        <br />
        Пригласите друга по ссылке — вы получите +2 бесплатных анализа, а друг +1.
      </motion.div>

      {referredUsers && referredUsers.length > 0 && (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Приглашённые</div>
          <div className="flex flex-col gap-3">
            {referredUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--primary-dark)", flexShrink: 0 }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {new Date(u.joinedAt).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: u.bonusGiven ? "rgba(76, 175, 80, 0.1)" : "rgba(255, 193, 7, 0.1)", color: u.bonusGiven ? "#4CAF50" : "#FF9800" }}>
                  {u.bonusGiven ? "Бонус получен" : "Ожидание"}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};
