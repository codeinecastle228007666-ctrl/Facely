"use client";

import React, { useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { ReferralStats } from "@/components/referral/ReferralStats";
import { ShareIcon } from "@/components/ui/Icons";
import { useTelegram } from "@/hooks/useTelegram";
import { api, type ReferralStatsResult } from "@/services/api";
import { motion } from "framer-motion";

export default function ReferralPage() {
  const { user: tgUser, impact } = useTelegram();
  const [stats, setStats] = useState<ReferralStatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referral.getReferralStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleShare = () => {
    impact("light");
    const botUsername = "skin_ritual_bot";
    const refCode = tgUser?.id || localStorage.getItem("__tid") || "";
    const refLink = `https://t.me/${botUsername}?start=${refCode}`;
    const text = `✨ Присоединяйся к Facely — AI-анализ кожи и персональный уход!\n${refLink}`;
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
          <>
            <ReferralStats
              invitedCount={stats?.count || 0}
              bonusAnalyses={stats?.bonusEarned || 0}
              onShare={handleShare}
            />
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
