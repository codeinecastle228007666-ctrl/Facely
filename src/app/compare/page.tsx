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
    } catch {
      alert("Ошибка сравнения");
    } finally {
      setLoading(false);
    }
  };

  const getPhoto = (id: string) => {
    const a = analyses.find((x) => x.id === id);
    return (a as any)?.photoBase64 || null;
  };

  const sel1 = analyses.find((a) => a.id === selected1);
  const sel2 = analyses.find((a) => a.id === selected2);

  return (
    <div style={{ paddingTop: 8, paddingBottom: 80 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Сравнение анализов</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select
          value={selected1}
          onChange={(e) => { setSelected1(e.target.value); setComparison(null); }}
          style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, background: "white" }}
        >
          <option value="">Анализ 1</option>
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {new Date(a.createdAt).toLocaleDateString("ru-RU")} - {a.skinType || "Анализ"}
            </option>
          ))}
        </select>
        <select
          value={selected2}
          onChange={(e) => { setSelected2(e.target.value); setComparison(null); }}
          style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, background: "white" }}
        >
          <option value="">Анализ 2</option>
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {new Date(a.createdAt).toLocaleDateString("ru-RU")} - {a.skinType || "Анализ"}
            </option>
          ))}
        </select>
      </div>

      {sel1 && sel2 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[sel1, sel2].map((s, i) => (
            <div key={i} style={{ flex: 1, height: 100, borderRadius: 14, overflow: "hidden", background: "var(--bg)" }}>
              {(s as any).photoBase64 ? (
                <img src={`data:image/jpeg;base64,${(s as any).photoBase64}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--text-muted)" }}>
                  Нет фото
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <motion.button
        onClick={handleCompare}
        disabled={!selected1 || !selected2 || loading || selected1 === selected2}
        whileTap={{ scale: 0.97 }}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: 16,
          background: !selected1 || !selected2 || selected1 === selected2 ? "var(--border)" : "linear-gradient(135deg, var(--primary), var(--secondary))",
          color: "white",
          fontSize: 15,
          fontWeight: 600,
          border: "none",
          marginBottom: 20,
          cursor: !selected1 || !selected2 || selected1 === selected2 ? "default" : "pointer",
        }}
      >
        {loading ? "Сравниваем..." : "Сравнить"}
      </motion.button>

      <AnimatePresence>
        {comparison && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 12, color: "var(--text-secondary)" }}>
              <span>{new Date(comparison.analysis1.date).toLocaleDateString("ru-RU")}</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>→</span>
              <span>{new Date(comparison.analysis2.date).toLocaleDateString("ru-RU")}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 13, color: "var(--text)" }}>
              <span>{comparison.analysis1.skinType || "—"}</span>
              <span>{comparison.analysis2.skinType || "—"}</span>
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
                  {diff.diff === 0 ? "0" : diff.improved ? `-${diff.diff}` : `+${Math.abs(diff.diff)}`}
                </div>
              </div>
            ))}

            {comparison.analysis1.skinType !== comparison.analysis2.skinType && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "var(--bg)", fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
                Тип кожи изменился с &laquo;{comparison.analysis1.skinType}&raquo; на &laquo;{comparison.analysis2.skinType}&raquo;
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
