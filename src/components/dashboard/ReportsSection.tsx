"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type ReportItem } from "@/services/api";

interface ReportsSectionProps {
  hasSubscription: boolean;
}

const DYNAMIC_LABELS: Record<string, { icon: string; color: string }> = {
  улучшение: { icon: "📈", color: "#7EC4D8" },
  ухудшение: { icon: "📉", color: "#E07A8E" },
  стабильно: { icon: "➡️", color: "#FFD166" },
};

export const ReportsSection: React.FC<ReportsSectionProps> = ({ hasSubscription }) => {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && hasSubscription) {
      setLoading(true);
      api.report.list()
        .then(setReports)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, hasSubscription]);

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
                <div style={{
                  textAlign: "center",
                  padding: "24px",
                  background: "var(--bg)",
                  borderRadius: 14,
                }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Отчёты формируются раз в неделю.<br />Скоро здесь появится первый отчёт.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {reports.map((r) => {
                    const dyn = r.dynamics?.dynamics || "";
                    const info = DYNAMIC_LABELS[dyn] || { icon: "📋", color: "var(--text-secondary)" };
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
                          marginBottom: 8,
                        }}>
                          <span style={{ fontSize: 18 }}>{info.icon}</span>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {new Date(r.generatedAt).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </span>
                          {r.dynamics?.dynamics && (
                            <span style={{
                              fontSize: 11,
                              padding: "2px 10px",
                              borderRadius: 8,
                              background: `${info.color}18`,
                              color: info.color,
                              fontWeight: 600,
                              marginLeft: "auto",
                            }}>
                              {r.dynamics.dynamics}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 13,
                          color: "var(--text)",
                          lineHeight: 1.6,
                        }}>
                          {r.summary || r.dynamics?.summary || "Нет данных"}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
