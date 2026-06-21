"use client";

import React, { useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { AnalysisCard } from "@/components/history/AnalysisCard";
import { api, type AnalysisHistoryItem, type AnalysisResult } from "@/services/api";
import { HistoryIcon, CloseIcon } from "@/components/ui/Icons";
import { motion, AnimatePresence } from "framer-motion";

const MOOD_COLORS: Record<string, string> = {
  позитивный: "#A8D8EA",
  нейтральный: "#F5C4B0",
  тревожный: "#E8A0B4",
};

export default function HistoryPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnalysisHistoryItem | null>(null);

  useEffect(() => {
    api.analysis
      .history({ limit: 50, offset: 0 })
      .then((data) => {
        setItems(data.analyses);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const result = selected?.result as AnalysisResult | null;

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
              background: "rgba(232, 160, 180, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HistoryIcon size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>История анализов</h1>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Всего: {total}
            </span>
          </div>
        </motion.div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
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
        ) : items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card flex flex-col items-center"
            style={{ padding: "48px 20px", gap: 12 }}
          >
            <HistoryIcon size={48} />
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              У вас пока нет анализов
            </p>
          </motion.div>
        ) : (
          <div>
            {items.map((item, i) => (
              <AnalysisCard key={item.id} item={item} index={i} onClick={() => setSelected(item)} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 300,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              style={{
                background: "white",
                width: "100%",
                maxWidth: 430,
                borderRadius: "24px 24px 0 0",
                padding: "24px 20px 32px",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                  {selected.skinType || "Результат анализа"}
                </h3>
                <button onClick={() => setSelected(null)}>
                  <CloseIcon size={22} />
                </button>
              </div>

              <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    background: "var(--primary-light)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--primary-dark)",
                  }}
                >
                  {result.skin_type}
                </div>
                <div
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    background: `${MOOD_COLORS[result.mood]}22`,
                    fontSize: 14,
                    fontWeight: 500,
                    color: MOOD_COLORS[result.mood],
                  }}
                >
                  {result.mood}
                </div>
              </div>

              {result.problems.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    Выявленные проблемы
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {result.problems.map((p, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 20,
                          background: "rgba(232, 160, 180, 0.1)",
                          fontSize: 12,
                          color: "var(--primary-dark)",
                        }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Рекомендации
                </div>
                {result.recommendations.map((r, i) => (
                  <div className="flex items-center gap-2" style={{ marginBottom: 6 }} key={i}>
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: "var(--primary)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{r}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Ежедневная рутина
                </div>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "var(--bg)",
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {result.daily_routine}
                </div>
              </div>

              {result.product_links && result.product_links.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    Рекомендуемые продукты
                  </div>
                  <div className="flex flex-col gap-2">
                    {result.product_links.map((p, i) => (
                      <a
                        key={i}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3"
                        style={{
                          padding: "10px 14px",
                          borderRadius: 14,
                          background: "var(--bg)",
                          textDecoration: "none",
                        }}
                      >
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: "var(--primary-light)",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            color: "var(--primary-dark)",
                            fontWeight: 600,
                            overflow: "hidden",
                          }}
                        >
                          <img
                            src={p.image}
                            alt={p.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                              (e.target as HTMLImageElement).parentElement!.innerText = p.name.slice(0, 2);
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{p.reason}</div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M7 17l10-10M7 7h10v10" stroke="#C47A8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
                {new Date(selected.createdAt).toLocaleDateString("ru-RU", {
                  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TabBar />
    </>
  );
}
