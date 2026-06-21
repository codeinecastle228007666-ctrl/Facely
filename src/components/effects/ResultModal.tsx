"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, FireIcon } from "@/components/ui/Icons";
import type { AnalysisResult } from "@/services/api";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface ResultModalProps {
  open: boolean;
  onClose: () => void;
  result: AnalysisResult | null;
  xpGained?: number;
  totalXp?: number;
  level?: number;
  streak?: number;
}

const MOOD_COLORS: Record<string, string> = {
  позитивный: "#A8D8EA",
  нейтральный: "#F5C4B0",
  тревожный: "#E8A0B4",
};

export const ResultModal: React.FC<ResultModalProps> = ({
  open,
  onClose,
  result,
  xpGained,
  totalXp,
  level,
  streak,
}) => {
  if (!result) return null;

  return (
    <AnimatePresence>
      {open && (
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
          onClick={onClose}
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
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Результат анализа</h3>
              <button onClick={onClose}>
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
                <div
                  key={i}
                  className="flex items-center gap-2"
                  style={{ marginBottom: 6 }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: "var(--primary)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {r}
                  </span>
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
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                          {p.reason}
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M7 17l10-10M7 7h10v10" stroke="#C47A8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {(xpGained !== undefined || streak !== undefined) && (
              <div
                className="card flex justify-between"
                style={{ background: "var(--bg)" }}
              >
                <div className="flex flex-col items-center">
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    XP получено
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "var(--primary-dark)" }}>
                    +{xpGained}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Всего XP
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{totalXp}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Стрик
                  </span>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "var(--primary-dark)",
                    }}
                  >
                    {streak}
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
