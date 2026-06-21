"use client";

import React from "react";
import { TabBar } from "@/components/ui/TabBar";
import { ReferralStats } from "@/components/referral/ReferralStats";
import { ShareIcon } from "@/components/ui/Icons";
import { useTelegram } from "@/hooks/useTelegram";
import { motion } from "framer-motion";

export default function ReferralPage() {
  const { impact, share } = useTelegram();

  const handleShare = () => {
    impact("light");
    const botUsername = "skin_ritual_bot";
    const refLink = `https://t.me/${botUsername}?start=ref_123`;
    share(`🌟 Присоединяйся к Facely — AI-анализ кожи и персональный уход!\n${refLink}`);
  };

  return (
    <>
      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          style={{ marginBottom: 16 }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "rgba(255, 180, 162, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShareIcon size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>Пригласить друзей</h1>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Получайте бонусы за рефералов
            </span>
          </div>
        </motion.div>

        <ReferralStats
          invitedCount={0}
          bonusAnalyses={0}
          onShare={handleShare}
        />
      </div>

      <TabBar />
    </>
  );
}
