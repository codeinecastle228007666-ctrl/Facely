"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type ReportCooldownStatus, type ReportItem } from "@/services/api";

interface ReportsSectionProps {
  hasSubscription: boolean;
}

const DYNAMIC_LABELS: Record<string, { icon: string; color: string }> = {
  улучшение: { icon: "📈", color: "#7EC4D8" },
  ухудшение: { icon: "📉", color: "#E07A8E" },
  стабильно: { icon: "➡️", color: "#FFD166" },
};

// 2026-06-29 — Compact human label for the cooldown countdown. Picks
// days when ≥48h remain, hours when ≥1h remain, else <1h fractional.
// Drives the "🔒 Следующий: 3 дня" caption on the locked button.
// 2026-06-29 — Live countdown. We take `nextAvailableAt` (server
// returns this at query time) and subtract elapsed millis since
// page load (`nowMs` ticks once per minute). Refresh via silent
// `status()` after every generate + on focus.
function formatCooldownRemaining(
  status: ReportCooldownStatus,
  nowMs: number,
): string {
  if (!status.nextAvailableAt) return "";
  const totalMs = new Date(status.nextAvailableAt).getTime() - nowMs;
  if (totalMs <= 0) return "скоро";
  const hours = Math.ceil(totalMs / (60 * 60 * 1000));
  if (hours >= 48) {
    const days = Math.ceil(hours / 24);
    return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`;
  }
  if (hours >= 1) {
    return `${hours} ${hours === 1 ? "час" : hours < 5 ? "часа" : "часов"}`;
  }
  return "<1 часа";
}

export const ReportsSection: React.FC<ReportsSectionProps> = ({ hasSubscription }) => {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cooldown, setCooldown] = useState<ReportCooldownStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 2026-06-29 — derived `nowMs` refreshes every minute so the
  // cooldown countdown stays honest without re-fetching. Uses
  // setInterval client-side only — no SSR concern because the
  // wrapping component is `"use client"`.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const loadReports = () => {
    if (!hasSubscription) return;
    setLoading(true);
    api.report.list()
      .then(setReports)
      .catch((e) => {
        console.error("[ReportsSection] list failed:", e?.message ?? e);
      })
      .finally(() => setLoading(false));
  };

  const loadCooldown = () => {
    if (!hasSubscription) return;
    api.report.status()
      .then(setCooldown)
      .catch((e) => {
        console.error("[ReportsSection] status failed:", e?.message ?? e);
      });
  };

  useEffect(() => {
    if (hasSubscription) {
      loadReports();
      loadCooldown();
    }
  }, [hasSubscription]);

  useEffect(() => {
    if (!hasSubscription) return;
    const tick = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, [hasSubscription]);

  useEffect(() => {
    if (open && hasSubscription && reports.length === 0) {
      loadReports();
    }
  }, [open, hasSubscription]);

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg(null);
    try {
      await api.report.generate();
      loadReports();
      loadCooldown();
    } catch (e: any) {
      // 2026-06-29 — surface server-side cooldown errors as a friendly
      // caption on the same spot the button lives, instead of just
      // logging. The thrown Error has `code === "REPORT_COOLDOWN_ACTIVE"`
      // and the message is already pre-localized in Russian.
      console.error("[ReportsSection] generate failed:", e?.message ?? e);
      setErrorMsg(e?.message ?? "Не удалось сформировать отчёт");
      loadCooldown();
    }
    setGenerating(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--bg-card)",
        borderRadius: 20,
        boxShadow: "var(--shadow)",
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => hasSubscription ? setOpen(!open) : null}
        style={{
          width: "100%",
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          border: "none",
          background: "transparent",
          cursor: hasSubscription ? "pointer" : "default",
        }}
      >
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: "rgba(168, 216, 234, 0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          opacity: hasSubscription ? 1 : 0.4,
          flexShrink: 0,
        }}>
          📊
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            Еженедельные отчёты
            {!hasSubscription && (
              <span style={{
                fontSize: 10,
                color: "#E89B87",
                marginLeft: 8,
                fontWeight: 500,
                background: "rgba(232, 155, 135, 0.12)",
                padding: "2px 8px",
                borderRadius: 6,
              }}>
                подписка
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {!hasSubscription
              ? "Оформите подписку для доступа к отчётам"
              : reports.length > 0
                ? `${reports.length} ${reports.length === 1 ? "отчёт" : "отчётов"}`
                : "Нет отчётов"}
          </div>
        </div>
        {hasSubscription && (
          <motion.svg
            animate={{ rotate: open ? 180 : 0 }}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            style={{ flexShrink: 0 }}
          >
            <path d="M6 9l6 6 6-6" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </motion.svg>
        )}
      </button>

      <AnimatePresence>
        {open && hasSubscription && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 16px 16px" }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: "24px", fontSize: 13, color: "var(--text-secondary)" }}>
                  Загрузка...
                </div>
              ) : reports.length === 0 ? (
                /* 2026-06-29 — Empty state branches on three distinct
                    states (reviewer caught an earlier bug where
                    `canGenerate === false` covered BOTH "cooldown
                    active" AND "need more analyses in last 7 days",
                    mislabeling new users with 🔒):
                      • needMore     → "make more analyses" hint, button OFF, no 🔒
                      • cooldownLock → "next in X days" hint, button OFF, 🔒
                      • ready        → button ON, primary style */
                (() => {
                  const needMore = cooldown && !cooldown.recentAnalysesEnough;
                  // Cooldown lock is meaningful only when recentAnalysesEnough
                  // is true; otherwise we're empty because of analyses count,
                  // not because of cooldown.
                  const cooldownLock =
                    cooldown?.canGenerate === false && !!cooldown?.recentAnalysesEnough;
                  return (
                    <div style={{
                      textAlign: "center",
                      padding: "24px",
                      background: "var(--bg)",
                      borderRadius: 14,
                    }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>{cooldownLock ? "🔒" : "📋"}</div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 14 }}>
                        {cooldownLock
                          ? `Следующий отчёт будет доступен через ${formatCooldownRemaining(cooldown!, nowMs)}.`
                          : needMore
                            ? "Ещё нет отчётов.\nНужно минимум 2 анализа за последние 7 дней."
                            : "Ещё нет отчётов.\nНажми кнопку, чтобы сформировать первый."}
                      </div>
                      <button
                        onClick={handleGenerate}
                        disabled={generating || !!cooldownLock}
                        style={{
                          padding: "10px 24px", borderRadius: 14,
                          background: generating || cooldownLock ? "var(--border)" : "var(--primary)",
                          color: generating || cooldownLock ? "var(--text-muted)" : "white",
                          fontSize: 13, fontWeight: 600, border: "none",
                          cursor: generating || cooldownLock ? "default" : "pointer",
                          display: "inline-flex", alignItems: "center", gap: 6,
                        }}
                      >
                        {generating
                          ? "Формируем\u2026"
                          : cooldownLock
                            ? `🔒 через ${formatCooldownRemaining(cooldown!, nowMs)}`
                            : "Сформировать отчёт"}
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col gap-3">
                  {reports.map((r) => {
                    const dyn = r.dynamics?.dynamics || "";
                    const info = DYNAMIC_LABELS[dyn] || { icon: "📋", color: "var(--text-secondary)" };
                    const d = r.dynamics || {};
                    return (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                          padding: "14px",
                          borderRadius: 14,
                          background: "var(--bg)",
                        }}
                      >
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 10,
                        }}>
                          <span style={{ fontSize: 18 }}>{info.icon}</span>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {new Date(r.generatedAt).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </span>
                          {dyn && (
                            <span style={{
                              fontSize: 11,
                              padding: "2px 10px",
                              borderRadius: 8,
                              background: `${info.color}18`,
                              color: info.color,
                              fontWeight: 600,
                              marginLeft: "auto",
                            }}>
                              {dyn}
                            </span>
                          )}
                        </div>

                        <div style={{
                          fontSize: 13,
                          color: "var(--text)",
                          lineHeight: 1.6,
                          fontWeight: 500,
                          marginBottom: 8,
                        }}>
                          {r.summary || d.summary}
                        </div>

                        {d.mainChange && (
                          <Section label="Главное изменение" text={d.mainChange} />
                        )}

                        {d.skinTypeChange && (
                          <Section label="Тип кожи" text={d.skinTypeChange} />
                        )}

                        {d.problemDynamics && (
                          <Section label="Динамика проблем" text={d.problemDynamics} />
                        )}

                        {d.routineAdvice && (
                          <div style={{
                            marginTop: 10,
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "rgba(126, 196, 216, 0.1)",
                            border: "1px solid rgba(126, 196, 216, 0.2)",
                          }}>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              🧴 Совет по уходу
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                              {d.routineAdvice}
                            </div>
                          </div>
                        )}

                        {d.weeklyGoal && (
                          <div style={{
                            marginTop: 8,
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "rgba(255, 209, 102, 0.1)",
                            border: "1px solid rgba(255, 209, 102, 0.2)",
                          }}>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              🎯 Цель на неделю
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                              {d.weeklyGoal}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  <button
                    /* Update button mirrors the same lock semantics as the
                        empty-state button above \u2014 reuses the
                        `cooldownLock` (recentAnalysesEnough-based) check,
                        not just raw canGenerate. */
                    onClick={handleGenerate}
                    disabled={generating || !!cooldownLock}
                    title={
                      cooldownLock
                        ? `Следующий отчёт через ${formatCooldownRemaining(cooldown!, nowMs)}`
                        : undefined
                    }
                    style={{
                      padding: "10px", borderRadius: 14,
                      background: "var(--bg)",
                      color: generating || cooldownLock
                        ? "var(--text-muted)" : "var(--text-secondary)",
                      fontSize: 12, fontWeight: 500,
                      border: "1px dashed var(--border)",
                      cursor: generating || cooldownLock ? "default" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      marginTop: 8,
                    }}
                  >
                    {generating
                      ? "Формируем\u2026"
                      : cooldownLock
                        ? `🔒 Следующий отчёт через ${formatCooldownRemaining(cooldown!, nowMs)}`
                        : "🔄 Обновить отчёт"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Section: React.FC<{ label: string; text: string }> = ({ label, text }) => (
  <div style={{ marginTop: 8 }}>
    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {label}
    </div>
    <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
      {text}
    </div>
  </div>
);
