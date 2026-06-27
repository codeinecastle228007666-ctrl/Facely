"use client";

import React from "react";
import { FireIcon, MicroscopeIcon, CrownIcon } from "@/components/ui/Icons";
import { motion } from "framer-motion";

interface BalanceCardProps {
  freeAnalyses: number;
  paidAnalyses: number;
  subscriptionActive: boolean;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  freeAnalyses,
  paidAnalyses,
  subscriptionActive,
}) => {
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      style={{ marginBottom: 12 }}
    >
      <div className="flex justify-between" style={{ gap: 8 }}>
        <div className="flex flex-col items-center" style={{ flex: 1, gap: 6 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "rgba(255, 143, 163, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FireIcon size={22} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            {freeAnalyses}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Бесплатных
          </span>
        </div>

        <div className="flex flex-col items-center" style={{ flex: 1, gap: 6 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "rgba(168, 216, 234, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MicroscopeIcon size={22} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            {paidAnalyses}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Куплено
          </span>
        </div>

        <div className="flex flex-col items-center" style={{ flex: 1, gap: 6 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: subscriptionActive
                ? "rgba(255, 215, 0, 0.15)"
                : "rgba(200, 180, 180, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CrownIcon size={22} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            {subscriptionActive ? "Да" : "Нет"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Подписка
          </span>
        </div>
      </div>
    </motion.div>
  );
};
