"use client";

import React, { useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { LockIcon, ChartIcon } from "@/components/ui/Icons";
import { api, type SubscriptionStatus, type ReportItem } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";

export default function ReportPage() {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchReportsAndSub = async () => {
    try {
      const [subscription, reportList] = await Promise.all([
        api.subscription.status().catch(() => null),
        api.report.list().catch(() => [] as any),
      ]);
      setSub(subscription);
      setReports(reportList as ReportItem[]);
      if (reportList && reportList.length > 0) {
        setSelectedReport(reportList[0] as ReportItem);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsAndSub();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg(null);
    try {
      const report = await api.report.generate();
      if (report) {
        await fetchReportsAndSub();
      } else {
        setErrorMsg("Для составления отчёта сделай как минимум 2 анализа кожи за последние 7 дней.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Ошибка при генерации отчёта. Пожалуйста, попробуй позже.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "3px solid var(--border)",
              borderTopColor: "var(--primary)",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
        <TabBar />
      </>
    );
  }

  if (!sub?.active) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card flex flex-col items-center"
          style={{ marginTop: 40, padding: "48px 20px", gap: 16, textAlign: "center" }}
        >
          <LockIcon size={48} />
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Доступно по подписке</h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Оформи PRO подписку, чтобы получать еженедельные отчёты о прогрессе кожи
          </p>
        </motion.div>
        <TabBar />
      </>
    );
  }

  const parsedDynamics = selectedReport?.dynamics as any;

  return (
    <>
      <div style={{ paddingTop: 8, paddingBottom: 80 }}>
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          style={{ marginBottom: 16 }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "rgba(168, 216, 234, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ChartIcon size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600 }}>Прогресс кожи</h1>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Еженедельная динамика
              </span>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn btn-primary"
            style={{
              padding: "8px 16px",
              fontSize: 12,
              borderRadius: 12,
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {generating ? (
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  animation: "spin 0.6s linear infinite",
                  display: "inline-block",
                }}
              />
            ) : "🧬"}
            {generating ? "Создаём..." : "Создать отчёт"}
          </button>
        </motion.div>

        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="card"
              style={{
                background: "rgba(232, 160, 180, 0.12)",
                border: "1px solid rgba(232, 160, 180, 0.3)",
                color: "#c24e6a",
                fontSize: 13,
                marginBottom: 16,
                padding: "12px 16px",
                borderRadius: 16,
              }}
            >
              ⚠️ {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {selectedReport ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <div className="card" style={{ padding: 20 }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background:
                      parsedDynamics?.dynamics === "улучшение"
                        ? "rgba(168, 216, 234, 0.15)"
                        : parsedDynamics?.dynamics === "ухудшение"
                          ? "rgba(232, 160, 180, 0.15)"
                          : "rgba(245, 196, 176, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  {parsedDynamics?.dynamics === "улучшение" ? "📈" : parsedDynamics?.dynamics === "ухудшение" ? "📉" : "➡️"}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {parsedDynamics?.dynamics === "улучшение"
                      ? "Прогресс заметен!"
                      : parsedDynamics?.dynamics === "ухудшение"
                        ? "Есть над чем работать"
                        : "Состояние стабильно"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Отчёт от {new Date(selectedReport.generatedAt).toLocaleDateString("ru-RU")}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-main)", marginBottom: 16 }}>
                {selectedReport.summary || parsedDynamics?.summary}
              </p>

              {parsedDynamics?.mainChange && (
                <div style={{ padding: "12px 14px", background: "var(--bg-secondary)", borderRadius: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    ✨ Ключевое изменение
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-main)" }}>
                    {parsedDynamics.mainChange}
                  </div>
                </div>
              )}

              {parsedDynamics?.skinTypeChange && (
                <div style={{ padding: "12px 14px", background: "var(--bg-secondary)", borderRadius: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    🧪 Тип кожи
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-main)" }}>
                    {parsedDynamics.skinTypeChange}
                  </div>
                </div>
              )}

              {parsedDynamics?.problemDynamics && (
                <div style={{ padding: "12px 14px", background: "var(--bg-secondary)", borderRadius: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    🔍 Разбор по проблемам
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-main)", lineHeight: 1.5 }}>
                    {parsedDynamics.problemDynamics}
                  </div>
                </div>
              )}

              {parsedDynamics?.routineAdvice && (
                <div style={{ padding: "12px 14px", background: "rgba(168, 216, 234, 0.15)", borderLeft: "4px solid var(--primary)", borderRadius: "4px 12px 12px 4px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--primary-dark)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    🌿 Рекомендация по уходу
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-main)", lineHeight: 1.5, fontWeight: 500 }}>
                    {parsedDynamics.routineAdvice}
                  </div>
                </div>
              )}

              {parsedDynamics?.weeklyGoal && (
                <div style={{ padding: "12px 14px", background: "rgba(255, 180, 162, 0.15)", borderLeft: "4px solid #FFB4A2", borderRadius: "4px 12px 12px 4px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#d26955", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    🎯 Цель на неделю
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-main)", lineHeight: 1.5, fontWeight: 500 }}>
                    {parsedDynamics.weeklyGoal}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card flex flex-col items-center"
            style={{ padding: "48px 20px", gap: 12, textAlign: "center" }}
          >
            <ChartIcon size={44} />
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Отчётов пока нет</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 280, margin: "0 auto", lineHeight: 1.5 }}>
              Сделай как минимум 2 анализа кожи за неделю, а затем нажми кнопку «Создать отчёт» выше!
            </p>
          </motion.div>
        )}

        {reports.length > 1 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>📜 История отчётов</h2>
            <div className="flex flex-col gap-2">
              {reports.map((r) => {
                const isSelected = selectedReport?.id === r.id;
                const rDynamics = (r.dynamics as any)?.dynamics;
                const rEmoji = rDynamics === "улучшение" ? "📈" : rDynamics === "ухудшение" ? "📉" : "➡️";
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedReport(r)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: isSelected ? "var(--bg-secondary)" : "var(--card-bg)",
                      border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border)",
                      borderRadius: 16,
                      padding: "12px 16px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "between",
                      gap: 12,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{rEmoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)" }}>
                        Еженедельный отчёт
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {new Date(r.generatedAt).toLocaleDateString("ru-RU")}
                      </div>
                    </div>
                    {isSelected && <span style={{ color: "var(--primary)", fontSize: 12, fontWeight: 600 }}>активен</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <TabBar />
    </>
  );
}
