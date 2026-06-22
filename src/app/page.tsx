"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/ui/TabBar";
import { UserProfile } from "@/components/dashboard/UserProfile";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { AnalysisButton } from "@/components/dashboard/AnalysisButton";
import { StreakCard } from "@/components/dashboard/StreakCard";
import { AnalysisInput } from "@/components/dashboard/AnalysisInput";
import { Onboarding } from "@/components/dashboard/Onboarding";
import { SkinDiary } from "@/components/dashboard/SkinDiary";
import { ResultModal } from "@/components/effects/ResultModal";
import { ConfettiEffect } from "@/components/effects/ConfettiEffect";
import { PurchaseModal } from "@/components/purchase/PurchaseModal";
import { useUser } from "@/hooks/useUser";
import { useTelegram } from "@/hooks/useTelegram";
import { api, type AnalysisResult, type AnalysisHistoryItem } from "@/services/api";
import { getLevelPerks } from "@/server/utils/levelSystem";
import { ProfileSkeleton, CardSkeleton } from "@/components/ui/Skeleton";

export default function Dashboard() {
  const router = useRouter();
  const { user, loading, refetch } = useUser();
  const { impact, notify } = useTelegram();
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [xpGained, setXpGained] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [newLevel, setNewLevel] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [prevAnalysisId, setPrevAnalysisId] = useState<string | null>(null);
  const [lastAnalysisId, setLastAnalysisId] = useState<string | null>(null);

  const level = user?.level || 1;
  const perks = getLevelPerks(level);
  const freeAnalyses = user?.freeAnalyses ?? 0;
  const paidAnalyses = user?.paidAnalyses ?? 0;
  const hasSub = user?.subscription?.status === "active";
  const canAnalyze = freeAnalyses > 0 || paidAnalyses > 0 || hasSub;

  useEffect(() => {
    if (!localStorage.getItem("facely_onboarding_shown") && user) {
      setOnboardingDone(false);
    } else {
      setOnboardingDone(true);
    }
  }, [user]);

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
        if (res.cached) {
          notify("warning");
        } else {
          notify("success");
        }
        refetch();

        const hist = await api.analysis.history({ limit: 2 });
        if (hist.analyses.length >= 2) {
          setPrevAnalysisId(hist.analyses[1].id);
          setLastAnalysisId(hist.analyses[0].id);
        }

        if (res.level > level) {
          setNewLevel(res.level);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2500);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "no_analyses_left" || msg === "no_free_analyses") {
          setPurchaseOpen(true);
        } else {
          notify("error");
          alert(msg || "Ошибка анализа");
        }
      } finally {
        setAnalyzing(false);
      }
    },
    [user, refetch, notify, level],
  );

  const handleShare = useCallback(() => {
    if (!result) return;
    const text = `✨ Facely — мой анализ кожи:\nТип: ${result.skin_type}\nПроблемы: ${result.problems.length > 0 ? result.problems.join(", ") : "не выявлены"}\nНастроение: ${result.mood}\n\nПопробуй сам! https://t.me/skin_ritual_bot`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        notify("success");
      }).catch(() => prompt("Скопируйте результат:", text));
    } else {
      prompt("Скопируйте результат:", text);
    }
  }, [result, notify]);

  if (loading) {
    return (
      <>
        <div style={{ paddingTop: 8 }}>
          <ProfileSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <TabBar />
      </>
    );
  }

  return (
    <>
      <Onboarding onDone={() => setOnboardingDone(true)} />
      <ConfettiEffect active={showConfetti} />

      <div style={{ paddingTop: 8 }}>
        <UserProfile
          name={user?.name || null}
          level={level}
          xp={user?.xp || 0}
          frame={perks.frame}
          badge={perks.badge}
          referralCount={user?.referralCount ?? 0}
        />
        <SkinDiary />
        <BalanceCard
          freeAnalyses={freeAnalyses}
          paidAnalyses={paidAnalyses}
          subscriptionActive={hasSub}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <AnalysisButton
              onPress={() => setInputOpen(true)}
              disabled={!canAnalyze}
              label={canAnalyze ? "Сделать анализ кожи" : "Нет анализов"}
            />
          </div>
          {!canAnalyze && (
            <button
              onClick={() => setPurchaseOpen(true)}
              style={{
                padding: "18px 16px",
                borderRadius: 24,
                background: "var(--secondary)",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Купить
            </button>
          )}
        </div>
        <StreakCard
          streak={user?.rituals?.streak || 0}
          maxStreak={user?.rituals?.maxStreak || 0}
          nextAnalysisDate={user?.rituals?.nextAnalysisDate || null}
        />
        <a
          href="/privacy"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 24,
            paddingBottom: 8,
            textDecoration: "none",
          }}
        >
          Политика конфиденциальности
        </a>
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
        onShare={handleShare}
        onCompare={prevAnalysisId && lastAnalysisId ? () => router.push(`/compare?id1=${prevAnalysisId}&id2=${lastAnalysisId}`) : undefined}
        hasPrevAnalysis={!!prevAnalysisId}
      />

      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        onSuccess={refetch}
      />

      <TabBar />
    </>
  );
}
