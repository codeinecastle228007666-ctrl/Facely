"use client";

import React, { useState, useCallback } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { UserProfile } from "@/components/dashboard/UserProfile";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { AnalysisButton } from "@/components/dashboard/AnalysisButton";
import { StreakCard } from "@/components/dashboard/StreakCard";
import { AnalysisInput } from "@/components/dashboard/AnalysisInput";
import { ResultModal } from "@/components/effects/ResultModal";
import { ConfettiEffect } from "@/components/effects/ConfettiEffect";
import { useUser } from "@/hooks/useUser";
import { useTelegram } from "@/hooks/useTelegram";
import { api, type AnalysisResult } from "@/services/api";

export default function Dashboard() {
  const { user, loading, refetch } = useUser();
  const { impact, notify } = useTelegram();
  const [inputOpen, setInputOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [xpGained, setXpGained] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [newLevel, setNewLevel] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const handleSubmit = useCallback(
    async (photoBase64: string, description?: string) => {
      setAnalyzing(true);
      try {
        const res = await api.analysis.analyze({ photoBase64, description });
        setResult(res.analysis);
        setXpGained(res.xpGained);
        setTotalXp(res.totalXp);
        setStreak(res.streak);
        setResultOpen(true);
        setInputOpen(false);
        notify("success");
        refetch();

        if (res.level > (user?.level || 1)) {
          setNewLevel(res.level);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2500);
        }
      } catch (e) {
        notify("error");
        alert(e instanceof Error ? e.message : "Ошибка анализа");
      } finally {
        setAnalyzing(false);
      }
    },
    [user, refetch, notify],
  );

  if (loading) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite" }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <TabBar />
      </>
    );
  }

  return (
    <>
      <ConfettiEffect active={showConfetti} />

      <div style={{ paddingTop: 8 }}>
        <UserProfile
          name={user?.name || null}
          level={user?.level || 1}
          xp={user?.xp || 0}
        />
        <BalanceCard
          freeAnalyses={user?.freeAnalyses ?? 0}
          paidAnalyses={user?.paidAnalyses ?? 0}
          subscriptionActive={user?.subscription?.status === "active"}
        />
        <AnalysisButton
          onPress={() => setInputOpen(true)}
          disabled={user?.freeAnalyses === 0 && user?.paidAnalyses === 0 && user?.subscription?.status !== "active"}
        />
        <StreakCard
          streak={user?.rituals?.streak || 0}
          maxStreak={user?.rituals?.maxStreak || 0}
        />
      </div>

      <AnalysisInput
        open={inputOpen}
        onClose={() => setInputOpen(false)}
        onSubmit={handleSubmit}
        loading={analyzing}
      />

      <ResultModal
        open={resultOpen}
        onClose={() => setResultOpen(false)}
        result={result}
        xpGained={xpGained}
        totalXp={totalXp}
        level={newLevel || undefined}
        streak={streak}
      />

      <TabBar />
    </>
  );
}
