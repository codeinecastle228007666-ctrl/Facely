"use client";

import React, { useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { ReferralStats } from "@/components/referral/ReferralStats";
import { ShareIcon } from "@/components/ui/Icons";
import { useTelegram } from "@/hooks/useTelegram";
import { api, type ReferralStatsResult } from "@/services/api";
import { motion } from "framer-motion";

export default function ReferralPage() {
  const { impact, share } = useTelegram();
  const [stats, setStats] = useState<ReferralStatsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.referral.getReferralStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleShare = () => {
    impact("light");
    const botUsername = "skin_ritual_bot";
    const refLink = `https://t.me/${botUsername}?start=ref_123`;
    share(`\u{1F31F} \u041F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u044F\u0439\u0441\u044F \u043A Facely — AI-\u0430\u043D\u0430\u043B\u0438\u0437 \u043A\u043E\u0436\u0438 \u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0443\u0445\u043E\u0434!\n${refLink}`);
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

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <ReferralStats
            invitedCount={stats?.count || 0}
            bonusAnalyses={stats?.bonusEarned || 0}
            onShare={handleShare}
          />
        )}
      </div>

      <TabBar />
    </>
  );
}
