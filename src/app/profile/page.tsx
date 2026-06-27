"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TabBar } from "@/components/ui/TabBar";
import { UserProfile } from "@/components/dashboard/UserProfile";
import { InventoryPanel } from "@/components/inventory/InventoryPanel";
import { AchievementsModal } from "@/components/dashboard/AchievementsModal";
import { PurchaseModal } from "@/components/purchase/PurchaseModal";
import { ReportsSection } from "@/components/dashboard/ReportsSection";
import { FeedbackModal } from "@/components/dashboard/FeedbackModal";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { AchievementsInline } from "@/components/dashboard/AchievementsInline";
import { MicroscopeIcon } from "@/components/ui/Icons";
import { useUser } from "@/hooks/useUser";
import { getLevelPerks } from "@/server/utils/levelSystem";
import { ProfileSkeleton } from "@/components/ui/Skeleton";

export default function ProfilePage() {
  const { user, loading, refetch } = useUser();
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const level = user?.level || 1;
  const perks = getLevelPerks(level);
  const hasSub = user?.subscription?.status === "active";

  if (loading) {
    return (
      <>
        <div style={{ paddingTop: 8 }}>
          <ProfileSkeleton />
          <div className="card" style={{ marginBottom: 12, height: 80 }} />
        </div>
        <TabBar />
      </>
    );
  }

  return (
    <>
      <div style={{ paddingTop: 8 }}>
        <UserProfile
          name={user?.name || null}
          level={level}
          xp={user?.xp || 0}
          frame={perks.frame}
          badge={perks.badge}
          referralCount={user?.referralCount ?? 0}
          onAchievementsClick={() => setAchievementsOpen(true)}
        />

        <BalanceCard
          freeAnalyses={user?.freeAnalyses ?? 0}
          paidAnalyses={user?.paidAnalyses ?? 0}
          subscriptionActive={hasSub}
        />

        <AchievementsInline onViewAll={() => setAchievementsOpen(true)} />

        {/* Store section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
          style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}
        >
          <button
            onClick={() => setPurchaseOpen(true)}
            style={{
              width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
              border: "none", background: "transparent", cursor: "pointer",
            }}
          >
            <MicroscopeIcon size={20} />
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Магазин</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Пополнить баланс анализов
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 5l7 7-7 7" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </motion.div>

        <InventoryPanel />

        <ReportsSection hasSubscription={hasSub} />

        <div style={{ display: "flex", justifyContent: "center", gap: 16, paddingBottom: 8, opacity: 0.5, marginTop: 12 }}>
          <a
            href="/privacy"
            style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}
          >
            Политика конфиденциальности
          </a>
          <button
            onClick={() => setFeedbackOpen(true)}
            style={{ fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "none" }}
          >
            Обратная связь
          </button>
        </div>
      </div>

      <AchievementsModal
        open={achievementsOpen}
        onClose={() => setAchievementsOpen(false)}
      />

      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        onSuccess={refetch}
      />

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />

      <TabBar />
    </>
  );
}
