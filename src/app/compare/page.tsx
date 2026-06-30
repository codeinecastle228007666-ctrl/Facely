"use client";

import React, { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, type AnalysisHistoryItem, type ComparisonResult } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import { pluralRu } from "@/lib/pluralRu";

function CompareFallback() {
  return (
    <div style={{ paddingTop: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <div style={{
        width: 48, height: 48,
        border: "4px solid var(--border)",
        borderTopColor: "var(--primary)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
        Загружаем сравнение...
      </div>
    </div>
  );
}

const FIELD_NAMES: Record<string, string> = {
  acne: "Акне",
  dark_circle: "Тёмные круги",
  pore: "Поры",
  spot: "Пигментация",
  wrinkle: "Морщины",
};

const FIELD_ICONS: Record<string, string> = {
  acne: "●",
  dark_circle: "◐",
  pore: "○",
  spot: "◍",
  wrinkle: "◯",
};

/**
 * 2026-06-27 — full-page spinner shared by both "fetching analyses" and
 * "comparing photos" loading states. Sized bigger than the in-slider
 * overlay so the first content the user sees on `/compare` is clearly
 * progress, not a half-loaded slider.
 */
function FullLoader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        paddingTop: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        minHeight: "50vh",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          border: "4px solid var(--border)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            textAlign: "center",
            maxWidth: 280,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

function ImageSlider({ before, after }: { before: string; after: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const handlePointer = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointer(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    handlePointer(e.clientX);
  };

  const onPointerUp = () => {
    setDragging(false);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3/4",
        maxHeight: "70vh",
        borderRadius: 20,
        overflow: "hidden",
        background: "var(--bg)",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <img
        src={`data:image/jpeg;base64,${after}`}
        alt="после"
        style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${position}%`,
          overflow: "hidden",
        }}
      >
        <img
          src={`data:image/jpeg;base64,${before}`}
          alt="до"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${position}%`,
          width: 4,
          background: "white",
          boxShadow: "0 0 12px rgba(0,0,0,0.3)",
          cursor: "ew-resize",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "white",
            boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 5l-7 7 7 7M15 5l7 7-7 7" stroke="#C47A8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          padding: "4px 12px",
          borderRadius: 10,
          background: "rgba(168, 216, 234, 0.85)",
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          backdropFilter: "blur(4px)",
          zIndex: 5,
        }}
      >
        ДО
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          padding: "4px 12px",
          borderRadius: 10,
          background: "rgba(126, 196, 216, 0.85)",
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          backdropFilter: "blur(4px)",
          zIndex: 5,
        }}
      >
        ПОСЛЕ
      </div>
    </div>
  );
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id1 = searchParams.get("id1");
  const id2 = searchParams.get("id2");

  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [selected1, setSelected1] = useState(id1 || "");
  const [selected2, setSelected2] = useState(id2 || "");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingIds, setFetchingIds] = useState(true);

  useEffect(() => {
    setSelected1(id1 || "");
    setSelected2(id2 || "");
  }, [id1, id2]);

  useEffect(() => {
    api.analysis.history({ limit: 50, offset: 0 })
      .then((data) => {
        setAnalyses(data.analyses);
        if (id1 && id2) {
          setSelected1(id1);
          setSelected2(id2);
        }
      })
      .catch(() => {})
      .finally(() => setFetchingIds(false));
  }, []);

  useEffect(() => {
    if (selected1 && selected2 && selected1 !== selected2 && analyses.length > 0) {
      handleCompare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected1, selected2, analyses]);

  const handleCompare = async () => {
    if (!selected1 || !selected2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.analysis.getComparison({ analysis1Id: selected1, analysis2Id: selected2 });
      setComparison(res);
    } catch {
      setError("Не удалось сравнить анализы. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const sel1 = analyses.find((a) => a.id === selected1);
  const sel2 = analyses.find((a) => a.id === selected2);

  // 2026-06-27 — page-level state machine so the user always sees:
  //   loader → photos → params (in that order).
  // Branches are mutually exclusive; "showPicker" requires the manual
  // flow (no URL ids) because URL-driven flow auto-fires handleCompare
  // and goes straight to isComparing → hasResult.
  const bothIds = !!selected1 && !!selected2 && selected1 !== selected2;
  const cameFromUrl = !!id1 && !!id2;
  const hasResult = !!comparison && bothIds;
  const isComparing = loading && !hasResult && bothIds;
  const isFetchingAnalyses = fetchingIds && !hasResult && !error;
  // 2026-06-27 — showEmptyState no longer guards on cameFromUrl: if a
  // deep-link (?id1=X&id2=Y) lands on a user with 0 analyses (or stale
  // ids), every other branch is false and the page would render only
  // the "Сравнение" header. The empty-state CTA fills that gap.
  const showEmptyState =
    !hasResult && !isComparing && !isFetchingAnalyses && !error &&
    analyses.length === 0;
  const showPicker =
    !hasResult && !isComparing && !isFetchingAnalyses && !error &&
    !cameFromUrl && analyses.length > 0;
  const showErrorState = !!error && !hasResult && !isComparing;

  return (
    <div style={{ paddingTop: 8, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 12,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5m0 0l6-6m-6 6l6 6" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Сравнение</h1>
      </div>

      <AnimatePresence mode="wait">
        {isFetchingAnalyses && (
          <motion.div
            key="fetch"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <FullLoader
              title="Загружаем анализы…"
              subtitle="Подбираем твою историю"
            />
          </motion.div>
        )}

        {isComparing && (
          <motion.div
            key="compare"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <FullLoader
              title="Сравниваем фото…"
              subtitle={`Анализируем ${pluralRu(2, ["изменение", "изменения", "изменений"])} между анализами`}
            />
          </motion.div>
        )}

        {showEmptyState && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              paddingTop: 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(196, 122, 143, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              📸
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              Пока нет анализов
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              Чтобы сравнить «до/после», сделай первый снимок — мы построим динамику автоматически.
            </div>
            <motion.a
              href="/"
              whileTap={{ scale: 0.97 }}
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "12px 22px",
                borderRadius: 16,
                background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Перейти к анализу
            </motion.a>
          </motion.div>
        )}

        {showErrorState && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              paddingTop: 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 36 }}>🤔</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Не получилось</div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
            <motion.button
              onClick={() => {
                setError(null);
                handleCompare();
              }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: "12px 22px",
                borderRadius: 16,
                background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                marginTop: 6,
              }}
            >
              Попробовать снова
            </motion.button>
          </motion.div>
        )}

        {showPicker && (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <select
                value={selected1}
                onChange={(e) => {
                  setSelected1(e.target.value);
                  setComparison(null);
                  setError(null);
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  background: "white",
                }}
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
                onChange={(e) => {
                  setSelected2(e.target.value);
                  setComparison(null);
                  setError(null);
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  background: "white",
                }}
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
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 100,
                      borderRadius: 14,
                      overflow: "hidden",
                      background: "var(--bg)",
                    }}
                  >
                    {(s as any).photoBase64 ? (
                      <img
                        src={`data:image/jpeg;base64,${(s as any).photoBase64}`}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
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
                background:
                  !selected1 || !selected2 || selected1 === selected2
                    ? "var(--border)"
                    : "linear-gradient(135deg, var(--primary), var(--secondary))",
                color: "white",
                fontSize: 15,
                fontWeight: 600,
                border: "none",
                marginBottom: 20,
                cursor:
                  !selected1 || !selected2 || selected1 === selected2 ? "default" : "pointer",
              }}
            >
              {loading ? "Сравниваем..." : "Сравнить"}
            </motion.button>
          </motion.div>
        )}

        {hasResult && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {comparison?.analysis1?.photoBase64 && comparison?.analysis2?.photoBase64 && (
              <div style={{ marginBottom: 20 }}>
                <ImageSlider
                  before={comparison.analysis1.photoBase64}
                  after={comparison.analysis2.photoBase64}
                />
              </div>
            )}

            {sel1 && sel2 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 16,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--text)",
                      fontSize: 13,
                      marginBottom: 2,
                    }}
                  >
                    {sel1.skinType || "—"}
                  </div>
                  {new Date(sel1.createdAt).toLocaleDateString("ru-RU")}
                </div>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <path
                    d="M5 12h14M13 5l7 7-7 7"
                    stroke="var(--primary-dark)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--text)",
                      fontSize: 13,
                      marginBottom: 2,
                    }}
                  >
                    {sel2.skinType || "—"}
                  </div>
                  {new Date(sel2.createdAt).toLocaleDateString("ru-RU")}
                </div>
              </div>
            )}

            {/* 2026-06-30 — "Что заметили в сравнении". Высокоуровневое
                резюме дельт из `comparison.differences` (improved /
                attention) плюс смена типа кожи. Рендерится ПЕРЕД
                существующей per-field карточкой, чтобы юзер сначала
                прочитал итог, а потом смотрел цифры. IIFE-обёртка
                нужна для многострочных let/const перед JSX. */}
            {comparison && (() => {
              const observations: Array<{
                type: "improved" | "attention" | "skin_type";
                text: string;
              }> = [];
              for (const [key, diff] of Object.entries(comparison.differences)) {
                if (diff.diff === 0) continue;
                const name = FIELD_NAMES[key] || key;
                if (diff.improved) {
                  observations.push({
                    type: "improved",
                    text: `${name}: улучшение на ${Math.abs(diff.diff)} ${pluralRu(
                      Math.abs(diff.diff),
                      ["пункт", "пункта", "пунктов"],
                    )}`,
                  });
                } else {
                  observations.push({
                    type: "attention",
                    text: `${name}: требует внимания (+${Math.abs(diff.diff)})`,
                  });
                }
              }
              if (
                comparison.analysis1.skinType !== comparison.analysis2.skinType
              ) {
                observations.push({
                  type: "skin_type",
                  text: `Тип кожи изменился с «${comparison.analysis1.skinType}» на «${comparison.analysis2.skinType}»`,
                });
              }
              return (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card"
                  style={{ marginBottom: 16 }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    ✨ Что заметили в сравнении
                  </div>
                  {observations.length === 0 ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      Кожа в стабильном состоянии между анализами — заметных сдвигов нет.
                    </div>
                  ) : (
                    <div className="flex flex-col" style={{ gap: 6 }}>
                      {observations.map((o, i) => {
                        const cfg =
                          o.type === "improved"
                            ? { icon: "✅", bg: "rgba(126, 196, 216, 0.10)" }
                            : o.type === "attention"
                              ? { icon: "⚠️", bg: "rgba(232, 160, 180, 0.10)" }
                              : { icon: "🔄", bg: "rgba(196, 122, 143, 0.10)" };
                        return (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              padding: "8px 10px",
                              borderRadius: 10,
                              background: cfg.bg,
                              fontSize: 13,
                              color: "var(--text)",
                              lineHeight: 1.5,
                            }}
                          >
                            <span style={{ fontSize: 14, lineHeight: 1.4 }}>
                              {cfg.icon}
                            </span>
                            <span style={{ flex: 1 }}>{o.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              );
            })()}

            {comparison && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card"
              >
                {Object.entries(comparison.differences).map(([key, diff]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flex: 1,
                      }}
                    >
                      <span style={{ fontSize: 18, opacity: 0.4 }}>
                        {FIELD_ICONS[key] || "•"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {FIELD_NAMES[key] || key}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: diff.improved ? "#7EC4D8" : "var(--text)",
                          transition: "color 0.3s",
                        }}
                      >
                        {diff.from}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M5 12h14M13 5l7 7-7 7"
                          stroke={diff.improved ? "#A8D8EA" : "#E8A0B4"}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: !diff.improved ? "#E8A0B4" : "var(--text)",
                          transition: "color 0.3s",
                        }}
                      >
                        {diff.to}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 10px",
                        borderRadius: 10,
                        background:
                          diff.diff === 0
                            ? "var(--bg)"
                            : diff.improved
                              ? "rgba(168, 216, 234, 0.15)"
                              : "rgba(232, 160, 180, 0.15)",
                        color:
                          diff.diff === 0
                            ? "var(--text-muted)"
                            : diff.improved
                              ? "#7EC4D8"
                              : "#E07A8E",
                        marginLeft: 8,
                        minWidth: 40,
                        textAlign: "center",
                      }}
                    >
                      {diff.diff === 0
                        ? "—"
                        : diff.improved
                          ? `-${diff.diff}`
                          : `+${Math.abs(diff.diff)}`}
                    </div>
                  </div>
                ))}

                {comparison.analysis1.skinType !== comparison.analysis2.skinType && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "var(--bg)",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      textAlign: "center",
                    }}
                  >
                    Тип кожи изменился с &laquo;{comparison.analysis1.skinType}&raquo; на &laquo;{comparison.analysis2.skinType}&raquo;
                  </div>
                )}
              </motion.div>
            )}

            {/* 2026-06-30 — "Что сделать дальше для улучшения". Тянем
                recommendations из ПОСЛЕДНЕГО анализа (analysis2) и
                нарезаем 3-на-задачу тем же слайсером, что использует
                ResultModal — так проблема и её план всегда на одной
                строке. Карточка не рендерится, если у analysis2 нет
                ни проблем, ни рекомендаций (например, кожа «чистая»). */}
            {comparison?.analysis2.result && (() => {
              const r2 = comparison.analysis2.result as {
                problems?: string[];
                recommendations?: string[];
              };
              let ri = 0;
              const recGroups: Array<{ problem: string; recs: string[] }> = [];
              if (r2.problems) {
                for (const p of r2.problems) {
                  const recs = (r2.recommendations ?? [])
                    .slice(ri, ri + 3)
                    .filter(Boolean);
                  ri += 3;
                  recGroups.push({ problem: p, recs });
                }
              }
              if (recGroups.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card"
                  style={{ marginTop: 16 }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    ➡️ Что сделать дальше
                  </div>
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    {recGroups.map((g, i) => {
                      const name = g.problem.replace(/\s*\(.+?\)/, "");
                      return (
                        <div
                          key={i}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "rgba(168, 216, 234, 0.08)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              marginBottom: 6,
                            }}
                          >
                            {name}
                          </div>
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: 18,
                              fontSize: 12,
                              color: "var(--text-secondary)",
                              lineHeight: 1.55,
                            }}
                          >
                            {g.recs.map((r, ri2) => (
                              <li key={ri2}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<CompareFallback />}>
      <CompareContent />
    </Suspense>
  );
}
