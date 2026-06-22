"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/ui/TabBar";
import { AnalysisCard } from "@/components/history/AnalysisCard";
import { api, type AnalysisHistoryItem, type AnalysisResult } from "@/services/api";
import { HistoryIcon, CloseIcon } from "@/components/ui/Icons";
import { motion, AnimatePresence } from "framer-motion";
import { CardSkeleton } from "@/components/ui/Skeleton";

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
  сухая: "Коже не хватает влаги. Требуется интенсивное увлажнение и питание.",
  жирная: "Повышенная активность сальных желёз. Рекомендуется матирующий уход.",
  комбинированная: "Жирная Т-зона и сухие щёки. Нужен сбалансированный уход.",
  нормальная: "Сбалансированное состояние кожи. Достаточно поддерживающего ухода.",
};

const SEVERITY_COLORS: Record<string, string> = {
  лёгкое: "#A8D8EA",
  умеренное: "#FFB4A2",
  выраженное: "#E8A0B4",
};

const PROBLEM_DESC: Record<string, string> = {
  акне: "Воспалительные элементы на коже. Могут быть вызваны гормональными изменениями, неправильным уходом или питанием.",
  "темные круги": "Потемнение кожи под глазами. Связано с усталостью, нарушением микроциркуляции или генетикой.",
  поры: "Расширенные поры — результат избытка себума и снижения упругости стенок пор.",
  пигментация: "Участки гиперпигментации — следствие избыточной выработки меланина под воздействием УФ.",
  морщины: "Снижение упругости кожи из-за уменьшения выработки коллагена и эластина.",
};

function parseSeverity(p: string): string | null {
  const m = p.match(/\((.+?)\)/);
  return m ? m[1] : null;
}

function cleanName(p: string): string {
  return p.replace(/\s*\(.+?\)/, "");
}

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnalysisHistoryItem | null>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);

  const [compareMode, setCompareMode] = useState(false);
  const [compareStep, setCompareStep] = useState<1 | 2>(1);
  const [compareIds, setCompareIds] = useState<{ before: string | null; after: string | null }>({ before: null, after: null });

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

  const handleCompareClick = (item: AnalysisHistoryItem) => {
    if (compareStep === 1) {
      setCompareIds({ before: item.id, after: null });
      setCompareStep(2);
    } else {
      if (item.id === compareIds.before) return;
      setCompareIds((prev) => ({ ...prev, after: item.id }));
    }
  };

  const isSelectedBefore = (id: string) => compareMode && compareIds.before === id;
  const isSelectedAfter = (id: string) => compareMode && compareIds.after === id;

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
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>История анализов</h1>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {compareMode ? `Шаг ${compareStep} из 2` : `Всего: ${total}`}
            </span>
          </div>
          <button
            onClick={() => {
              if (compareMode && compareIds.before && compareIds.after) {
                router.push(`/compare?id1=${compareIds.before}&id2=${compareIds.after}`);
              } else {
                setCompareMode(!compareMode);
                setCompareStep(1);
                setCompareIds({ before: null, after: null });
              }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              background: compareMode && compareIds.before && compareIds.after ? "var(--primary)" : "var(--bg-card)",
              border: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              color: compareMode && compareIds.before && compareIds.after ? "white" : "var(--text)",
            }}
          >
            {compareMode && compareIds.before && compareIds.after ? "Сравнить" : compareMode ? "Отмена" : "Сравнить"}
          </button>
        </motion.div>

        {compareMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              background: compareStep === 1 ? "rgba(168, 216, 234, 0.1)" : "rgba(168, 216, 234, 0.05)",
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: "50%",
              background: compareStep === 1 ? "#A8D8EA" : "#A8D8EA",
              color: "white", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              {compareStep === 1 ? "1" : "2"}
            </span>
            <span>
              {compareStep === 1
                ? "Выберите запись «ДО» (синяя подсветка)"
                : "Выберите запись «ПОСЛЕ» (зелёная подсветка)"}
            </span>
          </motion.div>
        )}

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
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
            {items.map((item, i) => {
              const sb = isSelectedBefore(item.id);
              const sa = isSelectedAfter(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (compareMode) {
                      handleCompareClick(item);
                    } else {
                      setSelected(item);
                    }
                  }}
                  style={{
                    borderRadius: 16,
                    border: sa
                      ? "2px solid #7EC4D8"
                      : sb
                      ? "2px solid #A8D8EA"
                      : "2px solid transparent",
                    marginBottom: 2,
                    transition: "border 0.2s",
                    cursor: compareMode ? "pointer" : undefined,
                  }}
                >
                  {sb && (
                    <div style={{
                      position: "absolute", marginLeft: 8, marginTop: 8,
                      fontSize: 10, fontWeight: 700, color: "white",
                      background: "#A8D8EA", padding: "2px 8px", borderRadius: 8,
                    }}>
                      ДО
                    </div>
                  )}
                  {sa && (
                    <div style={{
                      position: "absolute", marginLeft: 8, marginTop: 8,
                      fontSize: 10, fontWeight: 700, color: "white",
                      background: "#7EC4D8", padding: "2px 8px", borderRadius: 8,
                    }}>
                      ПОСЛЕ
                    </div>
                  )}
                  <AnalysisCard item={item} index={i} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fullImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={() => setFullImage(null)}
        >
          <img
            src={`data:image/jpeg;base64,${fullImage}`}
            alt=""
            style={{ maxWidth: "95%", maxHeight: "90%", borderRadius: 12, objectFit: "contain" }}
          />
          <div style={{ position: "absolute", top: 20, right: 20, color: "white", fontSize: 24, cursor: "pointer" }}>
            ✕
          </div>
        </motion.div>
      )}

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

              {(selected as any).photoBase64 && (
                <div
                  onClick={() => setFullImage((selected as any).photoBase64)}
                  style={{
                    width: "100%",
                    height: 160,
                    borderRadius: 14,
                    overflow: "hidden",
                    marginBottom: 16,
                    background: "var(--bg)",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={`data:image/jpeg;base64,${(selected as any).photoBase64}`}
                    alt="фото анализа"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              )}

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
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                  {MOOD_DESC[result.mood] || ""}
                </div>
              </div>

              {result.problems.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    Проблемы ({result.problems.length})
                  </div>
                  <div className="flex flex-col gap-3">
                    {result.problems.map((p, gi) => {
                      const sev = parseSeverity(p);
                      const clean = cleanName(p);
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.problems.length === 0 && (
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

              {result.recommendations.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    Рекомендации
                  </div>
                  <div className="flex flex-col gap-1">
                    {result.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span style={{ color: "var(--primary)", fontSize: 12, marginTop: 1 }}>•</span>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{r}</span>
                      </div>
                    ))}
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
