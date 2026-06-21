"use client";

import React, { useState, useEffect } from "react";
import { api, type AnalysisHistoryItem, type ComparisonResult } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";

const FIELD_NAMES: Record<string, string> = {
  acne: "Акне",
  dark_circle: "Темные круги",
  pore: "Поры",
  spot: "Пигментация",
  wrinkle: "Морщины",
};

export default function ComparePage() {
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [selected1, setSelected1] = useState<string>("");
  const [selected2, setSelected2] = useState<string>("");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.analysis.history({ limit: 50, offset: 0 }).then((data) => {
      setAnalyses(data.analyses);
    }).catch(() => {});
  }, []);

  const handleCompare = async () => {
    if (!selected1 || !selected2) return;
    setLoading(true);
    try {
      const res = await api.analysis.getComparison({ analysis1Id: selected1, analysis2Id: selected2 });
      setComparison(res);
    } catch (e) {
      alert("Ошибка сравнения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ paddingTop: 8, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Сравнение анализов</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select
          value={selected1}
          onChange={(e) => setSelected1(e.target.value)}
          style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, background: "white" }}
        >
          <option value="">Выберите анализ 1</option>
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {new Date(a.createdAt).toLocaleDateString("ru-RU")} - {a.skinType || "Анализ"}
            </option>
          ))}
        </select>
        <select
          value={selected2}
          onChange={(e) => setSelected2(e.target.value)}
          style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, background: "white" }}
        >
          <option value="">Выберите анализ 2</option>
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {new Date(a.createdAt).toLocaleDateString("ru-RU")} - {a.skinType || "Анализ"}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleCompare}
        disabled={!selected1 || !selected2 || loading}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 16,
          background: !selected1 || !selected2 ? "var(--border)" : "linear-gradient(135deg, var(--primary), var(--secondary))",
          color: "white",
          fontSize: 15,
          fontWeight: 600,
          border: "none",
          marginBottom: 20,
          cursor: !selected1 || !selected2 ? "default" : "pointer",
        }}
      >
        {loading ? "Сравниваем..." : "Сравнить"}
      </button>

      <AnimatePresence>
        {comparison && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 12, color: "var(--text-secondary)" }}>
              <span>{new Date(comparison.analysis1.date).toLocaleDateString("ru-RU")}</span>
              <span>{new Date(comparison.analysis2.date).toLocaleDateString("ru-RU")}</span>
            </div>

            {Object.entries(comparison.differences).map(([key, diff]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{FIELD_NAMES[key] || key}</span>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: diff.improved ? "var(--primary)" : "var(--text)" }}>
                    {diff.from}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 5l7 7-7 7" stroke={diff.improved ? "#A8D8EA" : "#E8A0B4"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 600, color: !diff.improved ? "var(--primary)" : "var(--text)" }}>
                    {diff.to}
                  </span>
                </div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: diff.improved ? "rgba(168, 216, 234, 0.15)" : "rgba(232, 160, 180, 0.15)",
                  color: diff.improved ? "#7EC4D8" : "#E07A8E",
                  marginLeft: 8,
                  minWidth: 36,
                  textAlign: "center",
                }}>
                  {diff.improved ? `-${diff.diff}` : `+${Math.abs(diff.diff)}`}
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                const text = `Мой прогресс кожи в Facely! Проверь и ты: https://t.me/skin_ritual_bot`;
                (window as any).Telegram?.WebApp?.shareToStory?.(text);
              }}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 14,
                background: "var(--bg)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--primary-dark)",
                border: "none",
                marginTop: 16,
                cursor: "pointer",
              }}
            >
              Поделиться в Stories
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
