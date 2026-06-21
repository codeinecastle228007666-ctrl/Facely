"use client";

import React from "react";
import { GiftIcon, ShareIcon } from "@/components/ui/Icons";
import { motion } from "framer-motion";

interface ReferralStatsProps {
  invitedCount: number;
  bonusAnalyses: number;
  onShare: () => void;
}

export const ReferralStats: React.FC<ReferralStatsProps> = ({
  invitedCount,
  bonusAnalyses,
  onShare,
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
    </div>
  );
};
