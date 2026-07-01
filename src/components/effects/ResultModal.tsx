"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import type { AnalysisResult, RussianProductSection } from "@/services/api";
import { useTelegram } from "@/hooks/useTelegram";
// 2026-07-01 — Clickable recommendations / clickable color-type badge.
import { findArticleSlug } from "@/data/ingredientArticles";
import { IngredientArticleModal } from "@/components/ui/IngredientArticleModal";

/**
 * Helper: a variant object keyed by `provider`. Drives the tab switcher
 * at the top of the modal in dual-mode Era (2026-06-25 evening).
 * Single-mode records have `variants` undefined and fall through to
 * render the legacy behavior (top-level fields).
 *
 * 2026-06-26 — added "gemini" for the new parallel provider. The tab
 * switcher iterates `Object.keys(result.variants)` so any new provider
 * added in the future automatically renders without UI changes.
 */
type VariantKey = "faceplus" | "gemini" | "huggingface";
const PROVIDER_LABELS: Record<VariantKey, string> = {
  faceplus: "Face++",
  gemini: "Gemini 2.5",
  huggingface: "HuggingFace",
};

interface ResultModalProps {
  open: boolean;
  onClose: () => void;
  result: AnalysisResult | null;
  /**
   * 2026-06-25 — the photo + visual mask/highlight overlay was removed.
   * Groq's coordinate detection was misclassifying nostrils / eyebrows /
   * lips as inflammation. We now rely solely on Face++ confidence-gated
   * structured data, so this prop is unused but kept in the signature
   * for backwards compatibility with callers that still pass it.
   */
  photoBase64?: string | null;
  xpGained?: number;
  totalXp?: number;
  level?: number;
  streak?: number;
  /**
   * 2026-06-30 — «onShare» kept (no inline UI binds it today, but other
   * entry points can wire it up). «onCompare» and «hasPrevAnalysis»
   * REMOVED 2026-06-30 at user request: the «Сравнить» button in the
   * post-analysis modal was deleted. The `/history` selection-mode
   * (two records → tap → top-right Compare) is the only remaining
   * compare entry point.
   */
  onShare?: () => void;
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

/**
 * 2026-07-01 — color_type short copy shown in the chip-row tap-reveal.
 * Inlined here rather than imported from `src/server/utils/skinScoring.ts`
 * to keep client components free of server-util imports (matches the
 * existing pattern of SKIN_TYPE_DESC / SKIN_TYPE_HINT being duplicated
 * across ResultModal + history/page.tsx — see their JSDoc). Drift
 * between this and skinScoring.COLOR_TYPE_DESC would surface as UI
 * silently dropping the цветотип badge for affected users.
 */
const COLOR_TYPE_DESC: Record<string, string> = {
  лето: "Холодный тон кожи — от светло-розовой до серовато-оливковой. Легко загорает, приобретая золотистый оттенок.",
  зима: "Холодный тон — очень светлая, почти фарфоровая кожа. Загорает медленно, редко приобретает видимый загар.",
  осень: "Тёплый тон — кожа золотистого оттенка, часто с веснушками. Не любит прямое солнце, склонна к пигментации.",
  весна: "Тёплый тон — тонкая, прозрачная, очень светлая кожа. Легко краснеет, быстро реагирует на раздражители.",
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
  photoBase64,
  xpGained,
  totalXp,
  level,
  streak,
  onShare,
}) => {
  const [activeTab, setActiveTab] = React.useState<VariantKey | null>(null);
  // 2026-07-01 — UI state for the two new click affordances: an
  // open-article slug (recommendation / product-link tap) and a
  // boolean toggle for the inline color-type description expansion.
  const [articleSlug, setArticleSlug] = React.useState<string | null>(null);
  const [colorTypeOpen, setColorTypeOpen] = React.useState(false);

  if (!result) return null;

  // Dual-mode: pick the variant for the currently active tab. Defaults
  // to whichever provider the orchestrator flagged as `activeProvider`.
  // Single-mode: variants undefined → fall back to top-level fields.
  // 2026-06-27 — `variantKeys` materialised here so the JSX tablist
  // can check count > 1 in one place (otherwise the unused-var lint
  // would be the only way to reach the JSX). Side benefit: ignoring
  // null/undefined entries from the variants map.
  const hasVariants = !!(result.variants && (result.variants.faceplus || result.variants.gemini || result.variants.huggingface));
  const variantKeys: VariantKey[] = hasVariants
    ? (Object.keys(result.variants!) as VariantKey[]).filter(
        (k) => !!(result.variants as Record<VariantKey, AnalysisResult | undefined>)[k],
      )
    : [];
  const pickedVariant: AnalysisResult | null = hasVariants
    ? (result.variants![activeTab ?? (result.activeProvider ?? "faceplus")] ?? null)
    : null;
  const display: AnalysisResult = pickedVariant ?? result;

  // Reset tab on close / when result changes (picks orchestrator's
  // default activeProvider each time we open a fresh analysis).
  React.useEffect(() => {
    setActiveTab(result.activeProvider ?? null);
  }, [result]);

  const problems = display.problems || [];
  const recommendations = display.recommendations || [];
  const productLinks = display.product_links || [];

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

            {display.data_quality === "partial" && (
              <div
                role="status"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(255, 180, 162, 0.18)",
                  border: "1px solid rgba(255, 180, 162, 0.5)",
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "#A05A4A",
                  marginBottom: 16,
                }}
              >
                <strong>Сервис анализа в ограниченном режиме.</strong>{" "}
                Основной провайдер (Face++) сейчас недоступен. Показаны проблемы, которые удалось
                распознать на фото (акне, пигментация, морщины); тип кожи и поры не проверялись.
                Повторите анализ через несколько часов, когда основной сервис восстановится.
              </div>
            )}

            {/*
              2026-06-27 — Hide the tab switcher when only one variant
              ran (single-provider pre-choice in AnalysisInput).
              Otherwise the tabs render one inactive chip that looks
              broken and signals "you can switch" when there is nothing
              to switch to. The condition uses `variantCount > 1` instead
              of just `hasVariants` so a solo Gemini or solo Face++
              record renders a clean header without tab UI.
            */}
            {hasVariants && result.variants && variantKeys.length > 1 && (
              <div
                role="tablist"
                style={{
                  display: "flex",
                  gap: 8,
                  padding: 4,
                  background: "var(--bg)",
                  borderRadius: 12,
                  marginBottom: 16,
                }}
              >
                {(Object.keys(result.variants) as VariantKey[]).map((key) => {
                  if (!result.variants![key]) return null;
                  const isActive = (activeTab ?? result.activeProvider ?? "faceplus") === key;
                  return (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(key)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "none",
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        background: isActive
                          ? "linear-gradient(135deg, var(--primary), var(--secondary))"
                          : "transparent",
                        color: isActive ? "white" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {PROVIDER_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-3" style={{ marginBottom: colorTypeOpen ? 8 : 16 }}>
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
                  {display.skin_type}
                </span>
                <span style={{ fontSize: 10, color: "var(--primary-dark)", opacity: 0.6, marginTop: 1 }}>
                  {SKIN_TYPE_HINT[display.skin_type] || ""}
                </span>
              </div>
              {/* 2026-07-01 — Color-type chip. Compact teal pill that
                  toggles a tap-reveal description panel below. Hidden
                  entirely when the active variant has no color_type
                  (legacy rows pre-feature, or Gemini variant where
                  clampColorType returned null). */}
              {display.color_type && COLOR_TYPE_DESC[display.color_type] && (
                <button
                  type="button"
                  onClick={() => setColorTypeOpen((v) => !v)}
                  aria-expanded={colorTypeOpen}
                  aria-label={`Цветотип: ${display.color_type}`}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 20,
                    background: colorTypeOpen
                      ? "rgba(126, 196, 216, 0.30)"
                      : "rgba(126, 196, 216, 0.18)",
                    border: "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#5BA0B0" }}>
                    ✦ {display.color_type}
                  </span>
                  <span style={{ fontSize: 9, color: "#5BA0B0", opacity: 0.6, marginTop: 1 }}>
                    цветотип
                  </span>
                </button>
              )}
              <div
                style={{
                  padding: "8px 16px",
                  borderRadius: 20,
                  background: `${MOOD_COLORS[display.mood]}22`,
                  fontSize: 14,
                  fontWeight: 500,
                  color: MOOD_COLORS[display.mood],
                }}
              >
                {display.mood}
              </div>
            </div>
            {/* 2026-07-01 — Inline tap-reveal description for the
                color_type chip. Conditional on colorTypeOpen AND a
                known color_type — preserves the chip-row's existing
                marginBottom when closed. */}
            {colorTypeOpen && display.color_type && COLOR_TYPE_DESC[display.color_type] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "rgba(126, 196, 216, 0.10)",
                  marginBottom: 16,
                  overflow: "hidden",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {COLOR_TYPE_DESC[display.color_type]}
                </div>
              </motion.div>
            )}

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
              {SKIN_TYPE_DESC[display.skin_type] || `Тип кожи: ${display.skin_type}`}
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: `${MOOD_COLORS[display.mood]}18`, fontSize: 13, color: MOOD_COLORS[display.mood] }}>
                <strong>Настроение кожи: {display.mood}</strong> — {MOOD_DESC[display.mood] || ""}
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
                            {group.recs.map((r, ri) => {
                              // 2026-07-01 — substring-match the recipe
                              // against `ingredientArticles.ts` registry.
                              // Strings with a known article open the
                              // bottom-sheet modal on tap; others render
                              // as plain text.
                              const slug = findArticleSlug(r);
                              if (slug) {
                                return (
                                  <button
                                    key={ri}
                                    type="button"
                                    onClick={() => setArticleSlug(slug)}
                                    style={{
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 8,
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      cursor: "pointer",
                                      textAlign: "left",
                                      fontSize: 12,
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    <span style={{ color: "var(--primary)", fontSize: 12, marginTop: 1 }}>•</span>
                                    <span
                                      style={{
                                        color: "var(--primary-dark)",
                                        textDecoration: "underline",
                                        textDecorationStyle: "dotted",
                                        textDecorationColor: "rgba(196, 122, 143, 0.4)",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {r}
                                    </span>
                                  </button>
                                );
                              }
                              return (
                                <div key={ri} className="flex items-start gap-2">
                                  <span style={{ color: "var(--primary)", fontSize: 12, marginTop: 1 }}>•</span>
                                  <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{r}</span>
                                </div>
                              );
                            })}
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

            {display.skin_score !== undefined && (
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Skin Score</div>
                <div style={{ position: "relative", display: "inline-block", width: 80, height: 80 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke={display.skin_score >= 80 ? "#4CAF50" : display.skin_score >= 50 ? "#FF9800" : "#E07A8E"}
                      strokeWidth="6" strokeDasharray={`${2 * Math.PI * 34 * display.skin_score / 100} ${2 * Math.PI * 34}`}
                      strokeLinecap="round" transform="rotate(-90, 40, 40)"
                    />
                    <text x="40" y="45" textAnchor="middle" fontSize="18" fontWeight={700} fill="var(--text)">
                      {display.skin_score}
                    </text>
                  </svg>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {display.skin_score >= 80 ? "Отличное состояние" : display.skin_score >= 50 ? "Требует внимания" : "Нужен уход"}
                </div>
                {display.data_quality === "partial" && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                    ⚠ Оценка приблизительная — часть параметров не проверялась
                  </div>
                )}
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
                {display.daily_routine}
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
                        {(() => {
                          // 2026-07-01 — Same slug-match treatment as
                          // recommendations above. Product-link names
                          // like "Сыворотка с витамином C" or
                          // "Крем с ретинолом" become clickable.
                          const slug = findArticleSlug(p.name);
                          if (slug) {
                            return (
                              <button
                                type="button"
                                onClick={() => setArticleSlug(slug)}
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--primary-dark)",
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                  textDecorationStyle: "dotted",
                                  textDecorationColor: "rgba(196, 122, 143, 0.4)",
                                  textAlign: "left",
                                }}
                              >
                                {p.name}
                              </button>
                            );
                          }
                          return <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>;
                        })()}
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

            {/*
              2026-06-30 — Russian-market purchasable product cards.
              Sourced from `russianProductCatalog.ts` (static catalog,
              12+ brands, ~50 specific products). Each entry has brand +
              line + products with name+format+reason — the user reads
              it and searches the brand+name in any Russian retail app
              (Wildberries / Ozon / Рив Гош / Летуаль / аптеки).
              Placed BELOW the AI «Рекомендуемые продукты» section so
              the abstract advice is first, the concrete shopping list
              second.
            */}
            {display.russian_products && display.russian_products.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  Средства, которые можно купить в России
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                  Подобраны под твой тип кожи и проблемы — копируй название и ищи на Wildberries, Ozon или в аптеке
                </div>
                <div className="flex flex-col gap-3">
                  {display.russian_products.map((section, si) => (
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

            {/* 2026-06-30 — «Сравнить» button removed at user request. The
                selection-mode flow on /history (two records → compare
                button at top-right) remains the canonical entry point
                for comparing analyses; we no longer offer the in-modal
                ad-hoc compare shortcut which competed for attention
                with the new «Средства, которые можно купить в России»
                recommendations block rendered just above. */}
          </motion.div>
        </motion.div>
      )}
      {/* 2026-07-01 — Clickable-recommendations article bottom-sheet.
          Independent of the result modal's open state — when the user
          taps a recommendation string, this AnimatePresence opens
          while the result modal stays mounted underneath for
          back-navigation continuity. `slug` is null when closed. */}
      <IngredientArticleModal
        slug={articleSlug}
        onClose={() => setArticleSlug(null)}
      />
    </AnimatePresence>
  );
};
