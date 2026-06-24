"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import type { AnalysisResult } from "@/services/api";
import { useTelegram } from "@/hooks/useTelegram";

interface ResultModalProps {
  open: boolean;
  onClose: () => void;
  result: AnalysisResult | null;
  xpGained?: number;
  totalXp?: number;
  level?: number;
  streak?: number;
  onCompare?: () => void;
  onShare?: () => void;
  hasPrevAnalysis?: boolean;
}

const MOOD_COLORS: Record<string, string> = {
  позитивный: "#A8D8EA",
  нейтральный: "#F5C4B0",
  тревожный: "#E8A0B4",
};

const MOOD_DESC: Record<string, string> = {
  позитивный: "Кожа в хорошем состоянии",
  нейтральный: "Есть незначительные проблемы",
  тревожный: "Требуется внимание",
};

const SKIN_TYPE_DESC: Record<string, string> = {
  сухая: "Коже не хватает влаги. Требуется интенсивное увлажнение и питание, избегайте агрессивного очищения.",
  жирная: "Повышенная активность сальных желёз. Рекомендуется матирующий уход, лёгкие текстуры и контроль себума.",
  комбинированная: "Жирная Т-зона (лоб, нос, подбородок) и сухие или нормальные щёки. Нужен сбалансированный уход для разных зон.",
  нормальная: "Сбалансированное состояние кожи. Достаточно поддерживающего ухода, увлажнения и SPF-защиты.",
};

const SKIN_TYPE_HINT: Record<string, string> = {
  сухая: "нуждается в увлажнении",
  жирная: "склонна к блеску",
  комбинированная: "разные зоны — разный уход",
  нормальная: "сбалансированное состояние",
};

const SEVERITY_COLORS: Record<string, string> = {
  лёгкое: "#A8D8EA",
  умеренное: "#FFB4A2",
  выраженное: "#E8A0B4",
};

const PROBLEM_DESC: Record<string, string> = {
  акне: "Воспалительные элементы — следствие избыточной работы сальных желёз и закупорки пор.",
  "темные круги": "Потемнение кожи под глазами. Часто связано с усталостью, нарушением микроциркуляции или генетикой.",
  поры: "Расширенные поры — результат избытка себума и снижения упругости стенок пор.",
  пигментация: "Участки гиперпигментации — следствие избыточной выработки меланина под воздействием УФ или постакне.",
  морщины: "Снижение упругости кожи из-за уменьшения выработки коллагена и эластина.",
};

export const ResultModal: React.FC<ResultModalProps> = ({
  open,
  onClose,
  result,
  xpGained,
  totalXp,
  level,
  streak,
  onCompare,
  onShare,
  hasPrevAnalysis,
}) => {
  if (!result) return null;

  const problems = result.problems || [];
  const recommendations = result.recommendations || [];
  const productLinks = result.product_links || [];

  const parseSeverity = (p: string): string | null => {
    const m = p.match(/\((.+?)\)/);
    return m ? m[1] : null;
  };

  const cleanName = (p: string): string => p.replace(/\s*\(.+?\)/, "");

  let recIndex = 0;
  const problemGroups = problems.map((p) => {
    const recs = recommendations.slice(recIndex, recIndex + 3).filter(Boolean);
    recIndex += 3;
    return { name: p, recs };
  });

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
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--primary-dark)" }}>
                  {result.skin_type}
                </span>
                <span style={{ fontSize: 10, color: "var(--primary-dark)", opacity: 0.6, marginTop: 1 }}>
                  {SKIN_TYPE_HINT[result.skin_type] || ""}
                </span>
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

            <div
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                background: "var(--bg)",
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}
            >
              {SKIN_TYPE_DESC[result.skin_type] || `Тип кожи: ${result.skin_type}`}
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: `${MOOD_COLORS[result.mood]}18`, fontSize: 13, color: MOOD_COLORS[result.mood] }}>
                <strong>Настроение кожи: {result.mood}</strong> — {MOOD_DESC[result.mood] || ""}
              </div>
            </div>

            {problemGroups.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Проблемы ({problems.length})
                </div>
                <div className="flex flex-col gap-3">
                  {problemGroups.map((group, gi) => {
                    const sev = parseSeverity(group.name);
                    const clean = cleanName(group.name);
                    return (
                      <div
                        key={gi}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          background: "rgba(232, 160, 180, 0.06)",
                        }}
                      >
                        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{clean}</span>
                          {sev && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: "2px 8px",
                                borderRadius: 10,
                                background: `${SEVERITY_COLORS[sev] || "#eee"}33`,
                                color: SEVERITY_COLORS[sev] || "#999",
                                fontWeight: 600,
                              }}
                            >
                              {sev}
                            </span>
                          )}
                        </div>
                        {PROBLEM_DESC[clean] && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, lineHeight: 1.5 }}>
                            {PROBLEM_DESC[clean]}
                          </div>
                        )}
                        {group.recs.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {group.recs.map((r, ri) => (
                              <div key={ri} className="flex items-start gap-2">
                                <span style={{ color: "var(--primary)", fontSize: 12, marginTop: 1 }}>•</span>
                                <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {problemGroups.length === 0 && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: "rgba(168, 216, 234, 0.1)",
                  fontSize: 13,
                  color: "#7EC4D8",
                  marginBottom: 16,
                  textAlign: "center",
                }}
              >
                Значимых проблем не выявлено. Продолжайте поддерживающий уход.
              </div>
            )}

            {result.skin_score !== undefined && (
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Skin Score</div>
                <div style={{ position: "relative", display: "inline-block", width: 80, height: 80 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke={result.skin_score >= 80 ? "#4CAF50" : result.skin_score >= 50 ? "#FF9800" : "#E07A8E"}
                      strokeWidth="6" strokeDasharray={`${2 * Math.PI * 34 * result.skin_score / 100} ${2 * Math.PI * 34}`}
                      strokeLinecap="round" transform="rotate(-90, 40, 40)"
                    />
                    <text x="40" y="45" textAnchor="middle" fontSize="18" fontWeight={700} fill="var(--text)">
                      {result.skin_score}
                    </text>
                  </svg>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {result.skin_score >= 80 ? "Отличное состояние" : result.skin_score >= 50 ? "Требует внимания" : "Нужен уход"}
                </div>
              </div>
            )}

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

            {productLinks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Рекомендуемые продукты
                </div>
                <div className="flex flex-col gap-2">
                  {productLinks.map((p, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-1"
                      style={{
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: "var(--bg)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: "var(--primary-light)",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                          }}
                        >
                          ✦
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 36 }}>
                        <div style={{ marginBottom: 2 }}>{p.reason}</div>
                        <div style={{ color: "var(--primary-dark)", fontStyle: "italic" }}>
                          ✦ {p.effect}
                        </div>
                      </div>
                    </div>
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

            <div className="flex gap-2" style={{ marginTop: 12 }}>
              {onShare && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onShare}
                  style={{
                    flex: 1,
                    padding: "14px",
                    borderRadius: 16,
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M15.5 6.5l-7 4M15.5 17.5l-7-4" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  Поделиться
                </motion.button>
              )}
              {onCompare && hasPrevAnalysis && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onCompare}
                  style={{
                    flex: 1,
                    padding: "14px",
                    borderRadius: 16,
                    background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                    color: "white",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Сравнить
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
