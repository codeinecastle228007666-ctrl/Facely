"use client";

import React, { useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { DynamicsChart } from "@/components/report/DynamicsChart";
import { DynamicsSummary } from "@/components/report/DynamicsSummary";
import { LockIcon, ChartIcon } from "@/components/ui/Icons";
import { api, type SubscriptionStatus, type ReportItem } from "@/services/api";
import { motion } from "framer-motion";

const MOCK_CHART_DATA = [
  { label: "Пн", value: 65, mood: "позитивный" },
  { label: "Вт", value: 72, mood: "позитивный" },
  { label: "Ср", value: 60, mood: "нейтральный" },
  { label: "Чт", value: 78, mood: "позитивный" },
  { label: "Пт", value: 74, mood: "нейтральный" },
  { label: "Сб", value: 85, mood: "позитивный" },
  { label: "Вс", value: 90, mood: "позитивный" },
];

export default function ReportPage() {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.subscription.status().catch(() => null),
      api.report.list().catch(() => [] as any),
    ])
      .then(([subscription, reportList]) => {
        setSub(subscription);
        setReports(reportList as ReportItem[]);
      })
      .finally(() => setLoading(false));
  }, []);

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
            Оформляйте PRO подписку, чтобы получать еженедельные отчёты о прогрессе кожи
          </p>
        </motion.div>
        <TabBar />
      </>
    );
  }

  const latest = reports[0];

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
        </motion.div>

        <DynamicsChart data={MOCK_CHART_DATA} />

        {latest ? (
          <DynamicsSummary
            summary={latest.summary}
            dynamics={latest.dynamics?.dynamics || null}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card flex flex-col items-center"
            style={{ padding: "32px 20px", gap: 8, textAlign: "center" }}
          >
            <ChartIcon size={36} />
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Отчёт появится после нескольких анализов
            </p>
          </motion.div>
        )}
      </div>

      <TabBar />
    </>
  );
}
