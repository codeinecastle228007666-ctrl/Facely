"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/ui/TabBar";
import { UserProfile } from "@/components/dashboard/UserProfile";
import { AnalysisButton } from "@/components/dashboard/AnalysisButton";
import { AnalysisInput } from "@/components/dashboard/AnalysisInput";
import { Onboarding } from "@/components/dashboard/Onboarding";
import { SkinDiary } from "@/components/dashboard/SkinDiary";
import { InventoryPanel } from "@/components/inventory/InventoryPanel";
import { AchievementsModal } from "@/components/dashboard/AchievementsModal";
import { ResultModal } from "@/components/effects/ResultModal";
import { ConfettiEffect } from "@/components/effects/ConfettiEffect";
import { PurchaseModal } from "@/components/purchase/PurchaseModal";
import { FeedbackModal } from "@/components/dashboard/FeedbackModal";
import { ReportsSection } from "@/components/dashboard/ReportsSection";
import { LastAnalysisCard } from "@/components/dashboard/LastAnalysisCard";
import { StreakCard } from "@/components/dashboard/StreakCard";
import { RoutineSection } from "@/components/routine/RoutineSection";
import { FireIcon } from "@/components/ui/Icons";
import { useUser } from "@/hooks/useUser";
import { useTelegram } from "@/hooks/useTelegram";
import { api, type AnalysisResult, type AnalysisHistoryItem } from "@/services/api";
import { getLevelPerks } from "@/server/utils/levelSystem";
import { ProfileSkeleton } from "@/components/ui/Skeleton";

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
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [totalXp, setTotalXp] = useState(0);
  const [newLevel, setNewLevel] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [nextAnalysisDate, setNextAnalysisDate] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [prevAnalysisId, setPrevAnalysisId] = useState<string | null>(null);
  const [lastAnalysisId, setLastAnalysisId] = useState<string | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisHistoryItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }
  }, [toast]);

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

  useEffect(() => {
    if (!user) return;
    api.analysis.history({ limit: 1, offset: 0 }).then((data) => {
      if (data.analyses.length > 0) setLastAnalysis(data.analyses[0]);
    }).catch(() => {});
    api.ritual.getStreak().then((r) => {
      setStreak(r.streak);
      setMaxStreak(r.maxStreak);
      setNextAnalysisDate(r.nextAnalysisDate);
    }).catch(() => {});
  }, [user]);
  const handleSubmit = useCallback(
    async (photoBase64: string, description?: string) => {
      setAnalyzing(true);
      try {
        const res = await api.analysis.analyze({ photoBase64, description });
        setPhotoData(photoBase64);
        setResult(res.analysis);
        setXpGained(res.xpGained);
        setTotalXp(res.totalXp);
        setStreak(res.streak);
        setResultOpen(true);
        setInputOpen(false);
        if (res.cached) {
          notify("warning");
          if (res.cachedAt) {
            const d = new Date(res.cachedAt);

            setToast(`\u0424\u043E\u0442\u043E \u0443\u0436\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043B\u043E\u0441\u044C ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`);
          }
        } else {
          notify("success");
        }
        refetch().then(() => {
          const currentLevel = user?.level ?? 1;
          api.analysis.history({ limit: 2 }).then((hist) => {
            if (hist.analyses.length >= 2) {
              setPrevAnalysisId(hist.analyses[1].id);
              setLastAnalysisId(hist.analyses[0].id);
            }
            if (hist.analyses.length > 0) {
              setLastAnalysis(hist.analyses[0]);
            }
            if (res.level > currentLevel) {
              setNewLevel(res.level);
              setShowConfetti(true);
              setTimeout(() => setShowConfetti(false), 2500);
            }
          });
        });
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
    [user, refetch, notify],
  );

  const handleShare = useCallback(() => {
    if (!result) return;
    const text = `✨ Reveli — мой анализ кожи:\nТип: ${result.skin_type}\nПроблемы: ${result.problems.length > 0 ? result.problems.join(", ") : "не выявлены"}\nНастроение: ${result.mood}\n\nПопробуй сам! https://t.me/Reveli_bot`;
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
          <div className="flex gap-2" style={{ marginBottom: 12 }}>
            <div className="card" style={{ flex: 1, height: 64 }} />
            <div className="card" style={{ flex: 1, height: 64 }} />
            <div className="card" style={{ flex: 1, height: 64 }} />
          </div>
        </div>
        <TabBar />
      </>
    );
  }

  return (
    <>
      <Onboarding onDone={() => setOnboardingDone(true)} />
      <ConfettiEffect active={showConfetti} />
      {toast && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
          }}
          onClick={() => setToast(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              background: "white", borderRadius: 20, padding: "28px 24px 20px",
              maxWidth: 320, width: "90%", textAlign: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📸</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Фото уже анализировалось
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 16 }}>
              {toast}
            </div>
            <button
              onClick={() => setToast(null)}
              style={{
                padding: "10px 32px", borderRadius: 14,
                background: "var(--primary)", color: "white",
                fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
              }}
            >
              Понятно
            </button>
          </motion.div>
        </motion.div>
      )}

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

        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          <motion.div
            className="card flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            style={{ flex: 1, padding: "14px 16px" }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255, 143, 163, 0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FireIcon size={18} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{streak}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.2 }}>стрик</div>
            </div>
          </motion.div>
          <motion.div
            className="card flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            style={{ flex: 1, padding: "14px 16px" }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(168, 216, 234, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              📊
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{user?._count?.analyses ?? 0}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.2 }}>анализов</div>
            </div>
          </motion.div>
          <motion.button
            onClick={() => setPurchaseOpen(true)}
            className="card flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            whileTap={{ scale: 0.97 }}
            style={{ flex: 1, padding: "14px 16px", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255, 215, 0, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              💎
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{freeAnalyses + paidAnalyses}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.2 }}>доступно</div>
            </div>
          </motion.button>
        </div>

        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <AnalysisButton
              onPress={() => setInputOpen(true)}
              disabled={!canAnalyze}
              label={canAnalyze ? "Сделать анализ кожи" : "Нет анализов"}
            />
          </div>
          {!canAnalyze && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
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
            </motion.button>
          )}
        </div>

        <LastAnalysisCard item={lastAnalysis} />

        <StreakCard
          streak={streak}
          maxStreak={maxStreak}
          nextAnalysisDate={nextAnalysisDate}
        />

        <div style={{ marginBottom: 12 }}>
          <RoutineSection />
          <SkinDiary />
          <InventoryPanel />
          <ReportsSection hasSubscription={hasSub} />
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 16, paddingBottom: 8 }}>
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
        photoBase64={photoData}
        xpGained={xpGained}
        totalXp={totalXp}
        level={newLevel || undefined}
        streak={streak}
        onShare={handleShare}
        onCompare={prevAnalysisId && lastAnalysisId ? () => router.push(`/compare?id1=${prevAnalysisId}&id2=${lastAnalysisId}`) : undefined}
        hasPrevAnalysis={!!prevAnalysisId}
      />

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
