"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/ui/TabBar";
import { AnalysisCard } from "@/components/history/AnalysisCard";
import { SkinHealthIndex } from "@/components/history/SkinHealthIndex";
import { api, type AnalysisHistoryItem, type AnalysisResult } from "@/services/api";
import type { RussianProductSection } from "@/services/api";
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
  акне: "Воспалительные элементы на коже. Могут быть вызваны гормональными изменениями, неправильным уходом или питанием.",
  "тёмные круги": "Потемнение кожи под глазами. Связано с усталостью, нарушением микроциркуляции или генетикой.",
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
  // 2026-06-30 — Lazy-loaded photo for the detail bottom-sheet. The list
  // itself no longer carries `photoBase64` (was ~150KB per row, blowing up
  // the first-paint JSON to ~7.5MB for users with 50+ analyses). On user
  // click we fire `api.analysis.getPhoto({ analysisId })` and store the
  // base64 string here; the photo container falls back to a skeleton
  // pulse while the roundtrip is in flight. State is cleared when the
  // user closes the detail (so next open re-fetches if they reopen).
  const [detailPhoto, setDetailPhoto] = useState<string | null>(null);
  const [detailPhotoLoading, setDetailPhotoLoading] = useState(false);
  // 2026-06-30 — Holds the AbortController of the in-flight photo fetch so
  // we can abort a stale request when the user opens a different entry
  // before the previous one resolves. Without this, the dropped request
  // still completes on the server (wasted cycles) and may write its
  // result into state after a newer one already replaced `detailPhoto`.
  const fetchControllerRef = useRef<AbortController | null>(null);

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

  // 2026-06-30 — Lazy photo fetch with race-condition guard. When the user
  // opens entry A and then quickly opens entry B before A's `getPhoto`
  // roundtrip resolves, we must NOT set B's photo container to A's image.
  // Pattern: increment a per-open token; the `.then`/`.catch`/`.finally`
  // closures compare their captured token against the current one and bail
  // out if A is no longer the latest open. Also aborts in-flight XHR via
  // AbortController so the network layer doesn't carry the dropped
  // request to completion just to discard the result client-side.
  const photoFetchTokenRef = useRef(0);
  const handleSelectItem = (item: AnalysisHistoryItem) => {
    const token = ++photoFetchTokenRef.current;
    setSelected(item);
    setDetailPhoto(null);
    setDetailPhotoLoading(true);
    fetchControllerRef.current?.abort();
    const ctrl = new AbortController();
    fetchControllerRef.current = ctrl;
    api.analysis
      .getPhoto({ analysisId: item.id })
      .then((res) => {
        if (photoFetchTokenRef.current !== token) return;
        setDetailPhoto(res.photoBase64);
      })
      .catch(() => {
        if (photoFetchTokenRef.current !== token) return;
        setDetailPhoto(null);
      })
      .finally(() => {
        if (photoFetchTokenRef.current !== token) return;
        setDetailPhotoLoading(false);
      });
  };

  const handleCloseDetail = () => {
    ++photoFetchTokenRef.current;
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = null;
    setSelected(null);
    setDetailPhoto(null);
    setDetailPhotoLoading(false);
  };

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
            <span>                {compareStep === 1
                  ? "Выберите запись «ДО» (голубая подсветка)"
                  : "Выберите запись «ПОСЛЕ» (бирюзовая подсветка)"}
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
          <>
            {/* 2026-06-27 — at-a-glance dashboard card: gauge + line chart */}
            <SkinHealthIndex items={items} />
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
                        handleSelectItem(item);
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
                    <AnalysisCard item={item} index={i} showCheckbox={compareMode} checked={sb || sa} onCheck={() => handleCompareClick(item)} />
                  </div>
                );
              })}
            </div>
          </>
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
            onClick={handleCloseDetail}
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
                <button onClick={handleCloseDetail}>
                  <CloseIcon size={22} />
                </button>
              </div>

              {/* 2026-06-30 — Photo container now driven by lazy `detailPhoto`
                  state. Three states: skeleton while loading, real image
                  when fetched, plain bg when fetch returned null (legacy
                  rows without stored photo). Tapping the loaded image
                  opens the fullscreen `fullImage` overlay as before. */}
              <div
                onClick={() => detailPhoto && setFullImage(detailPhoto)}
                style={{
                  width: "100%",
                  height: 160,
                  borderRadius: 14,
                  overflow: "hidden",
                  marginBottom: 16,
                  background: "var(--bg)",
                  cursor: detailPhoto ? "pointer" : "default",
                  position: "relative",
                }}
              >
                {detailPhotoLoading && (
                  <div
                    className="shimmer"
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
                      // 2026-06-30 — drives the `@keyframes shimmer` defined
                      // in globals.css. Using existing keyframe instead of
                      // adding a new one (less CSS bloat; matches what
                      // Skeleton/AddProductModal already use).
                      backgroundSize: "200% 100%",
                      animation: "shimmer 1.4s linear infinite",
                    }}
                  />
                )}
                {!detailPhotoLoading && detailPhoto && (
                  <img
                    src={`data:image/jpeg;base64,${detailPhoto}`}
                    alt="фото анализа"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
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
                {result.skin_score !== undefined && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 12px" }}>
                    <div style={{ position: "relative", width: 52, height: 52 }}>
                      <svg width="52" height="52" viewBox="0 0 52 52">
                        <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border)" strokeWidth="4" />
                        <circle cx="26" cy="26" r="22" fill="none" stroke={result.skin_score >= 80 ? "#4CAF50" : result.skin_score >= 50 ? "#FF9800" : "#E07A8E"} strokeWidth="4" strokeDasharray={`${2 * Math.PI * 22 * result.skin_score / 100} ${2 * Math.PI * 22}`} strokeLinecap="round" transform="rotate(-90, 26, 26)" />
                        <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight={700} fill="var(--text)">{result.skin_score}</text>
                      </svg>
                    </div>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>Score</span>
                  </div>
                )}
                <div style={{ padding: "8px 16px", borderRadius: 20, background: `${MOOD_COLORS[result.mood]}22`, fontSize: 14, fontWeight: 500, color: MOOD_COLORS[result.mood] }}>
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
                      <div
                        key={i}
                        className="flex flex-col gap-1"
                        style={{ padding: "12px 14px", borderRadius: 14, background: "var(--bg)" }}
                      >
                        <div className="flex items-center gap-2">
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--primary-light)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✦</div>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 36 }}>
                          <div style={{ marginBottom: 2 }}>{p.reason}</div>
                          <div style={{ color: "var(--primary-dark)", fontStyle: "italic" }}>✦ {p.effect}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2026-06-30 — Mirror of ResultModal's Russian-product
                  section, reading the same `russian_products` field
                  already persisted on every analysis since the
                  russianProductCatalog.middleware in analyze(). The
                  empty-state ("Спроси в чате") is left to the UI when
                  russian_products is undefined or empty. */}
              {result.russian_products && result.russian_products.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    Средства, которые можно купить в России
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                    Подобраны под твой тип кожи и проблемы — копируй название и ищи на Wildberries, Ozon или в аптеке
                  </div>
                  <div className="flex flex-col gap-3">
                    {result.russian_products.map((section, si) => (
                      <div
                        key={`${section.brand}-${section.lineName}-${si}`}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 14,
                          background: "rgba(168, 216, 234, 0.08)",
                          border: "1px solid rgba(168, 216, 234, 0.2)",
                        }}
                      >
                        <div style={{ marginBottom: 6 }}>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "white",
                              background: "linear-gradient(135deg, #A8D8EA 0%, #7EC4D8 100%)",
                              padding: "3px 10px",
                              borderRadius: 8,
                              marginRight: 8,
                            }}
                          >
                            {section.brand}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {section.lineName}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                          {section.lineDescription}
                        </div>
                        <div className="flex flex-col gap-2">
                          {section.products.map((product, pi) => (
                            <div
                              key={`${section.brand}-${section.lineName}-${pi}`}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "white",
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                                {product.name}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>
                                <em style={{ fontStyle: "normal", opacity: 0.7 }}>{product.format}</em>
                              </div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                                {product.why}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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
