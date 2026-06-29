"use client";

import React from "react";
import { motion } from "framer-motion";
import type { AnalysisHistoryItem } from "@/services/api";

interface SkinHealthIndexProps {
  /** History list as returned by `api.analysis.history` (server sorts most-recent
   *  first). We re-derive chronologically inside the component to build the chart
   *  left-to-right (oldest → newest). */
  items: AnalysisHistoryItem[];
}

// 2026-06-29 — Y-axis now auto-fits to actual data with a 6-point padding
// on each side, floored at 0 and ceiled at 100 (skin_score semantic range).
// A dynamic range amplifies the visual delta — three 40-point analyses
// stop looking like one flat line. Falls back to [0, 100] when there's
// only one data point or all points share the same value (range === 0).
const Y_FLOOR = 0;
const Y_CEIL = 100;
const Y_PADDING = 6;

const CHART_WIDTH = 280;
// 2026-06-29 — chart height 70 → 92 so dots, line strokes, and threshold
// guides have room to breathe. Heights below ~80 made 2.5px dots overlap
// stroke dashes on dense histories.
const CHART_HEIGHT = 92;
// PADDING.left widened from 10 → 22 to accommodate a left-edge Y-axis
// label (e.g. "100", "80", "50", "0") so the chart's values are readable
// without a legend overlay.
const PADDING = { top: 8, right: 10, bottom: 18, left: 22 };

const GAUGE_SIZE = 88;
const GAUGE_R = 34;

// Score threshold palette mirrors home-page LastAnalysisCard.tsx + ResultModal.tsx.
function scoreColor(score: number): string {
  if (score >= 80) return "#4CAF50";
  if (score >= 50) return "#FF9800";
  return "#E07A8E";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Отличное состояние";
  if (score >= 50) return "Требует внимания";
  return "Нужен уход";
}

// Pluck every item whose `result.skin_score` is a finite number, then reverse
// to ascending order (oldest first) for left-to-right charting.
function getScoredSeries(items: AnalysisHistoryItem[]) {
  return items
    .filter((it) => it.result && typeof it.result.skin_score === "number")
    .slice();
}

function formatRuDate(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export const SkinHealthIndex: React.FC<SkinHealthIndexProps> = ({ items }) => {
  // `latest` lives at the start of the server response (descending); `scored`
  // is the same data but oldest-first for the chart.
  const latest = items.find(
    (it) => it.result && typeof it.result.skin_score === "number",
  );
  const scored = getScoredSeries(items).reverse();

  if (!latest || !latest.result || scored.length < 1) return null;

  const latestScore = latest.result.skin_score;
  const color = scoreColor(latestScore);

  // Trend: compare latest to previous (chronologically prior) — only when
  // there are ≥2 scored points. ±2 score = "flat" because small jitter
  // is below user-visible resolution.
  let trend: "up" | "down" | "flat" | null = null;
  let trendDelta = 0;
  if (scored.length >= 2) {
    const prev = scored[scored.length - 2];
    trendDelta = latestScore - prev.result!.skin_score;
    if (trendDelta >= 3) trend = "up";
    else if (trendDelta <= -3) trend = "down";
    else trend = "flat";
  }

  const scores = scored.map((s) => s.result!.skin_score);
  const avg = Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length);
  const max = Math.max(...scores);
  const min = Math.min(...scores);

  // 2026-06-29 — auto-fit Y-axis. Range collapses to the actual data
  // spread + breathing room so the line + dots visibly swing. If all
  // points are identical (range === 0), pin to a stat-symmetric window
  // around the value; otherwise use [min-PADDING, max+PADDING].
  const minScore = min;
  const maxScore = max;
  const scoreSpread = maxScore - minScore;
  const yRange =
    scoreSpread === 0
      ? { lo: Math.max(Y_FLOOR, minScore - Y_PADDING * 2), hi: Math.min(Y_CEIL, maxScore + Y_PADDING * 2) }
      : {
          lo: Math.max(Y_FLOOR, minScore - Y_PADDING),
          hi: Math.min(Y_CEIL, maxScore + Y_PADDING),
        };
  const Y_MIN = yRange.lo;
  const Y_MAX = yRange.hi;

  const plotW = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const toX = (i: number) =>
    PADDING.left +
    (scored.length > 1 ? (i / (scored.length - 1)) * plotW : plotW / 2);
  const toY = (v: number) =>
    PADDING.top + plotH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

  // For density > ~10 the whole window is squashed into <30px × point, so
  // we label only first / middle-ish / last. Without this all the date
  // strings overlap and become unreadable.
  const showLabelIndices: number[] =
    scored.length <= 6
      ? scored.map((_, i) => i)
      : scored.length <= 12
        ? [0, Math.floor(scored.length / 2), scored.length - 1]
        : [0, Math.floor(scored.length / 4), Math.floor((scored.length * 3) / 4), scored.length - 1];

  const linePath = scored
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.result!.skin_score)}`)
    .join(" ");
  const lastPointIdx = scored.length - 1;
  const areaPath = `${linePath} L ${toX(lastPointIdx)} ${PADDING.top + plotH} L ${toX(0)} ${PADDING.top + plotH} Z`;

  // SVG gauge (ring + numeric label inside).
  const gaugeCirc = 2 * Math.PI * GAUGE_R;
  const gaugeDash = `${(latestScore / 100) * gaugeCirc} ${gaugeCirc}`;

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginBottom: 14 }}
    >
      {/* Top — title + trend chip. flexWrap + gap ensure the chip
          drops to a second line on narrow (<320px) viewports instead
          of butting against the title and clipping. */}
      <div className="flex items-center justify-between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Индекс здоровья кожи</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            {scored.length === 1
              ? "Первая запись"
              : `За ${scored.length} ${scored.length === 1 ? "анализ" : scored.length < 5 ? "анализа" : "анализов"}`}
          </div>
        </div>
        {trend && (
          <div
            title={
              trend === "up"
                ? `Лучше предыдущего на +${trendDelta}`
                : trend === "down"
                  ? `Хуже предыдущего на ${trendDelta}`
                  : "Без изменений"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              padding: "5px 10px",
              borderRadius: 16,
              background:
                trend === "up"
                  ? "rgba(76, 175, 80, 0.14)"
                  : trend === "down"
                    ? "rgba(224, 122, 142, 0.14)"
                    : "rgba(168, 216, 234, 0.14)",
              color:
                trend === "up" ? "#3F9143" : trend === "down" ? "#E07A8E" : "#7EC4D8",
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>
              {trend === "up" ? "▲" : trend === "down" ? "▼" : "="}
            </span>
            {trend !== "flat" && (
              <span>
                {trendDelta > 0 ? "+" : ""}
                {trendDelta}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mid — gauge + chart side-by-side. gap 8 (was 16) since the
          gauge grew from 72 → 88px; chart already uses flex:1 minWidth:0 */}
      <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
        {/* Gauge */}
        <div style={{ flexShrink: 0, position: "relative", width: GAUGE_SIZE, height: GAUGE_SIZE }}>
          <svg
            width={GAUGE_SIZE}
            height={GAUGE_SIZE}
            viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
            role="img"
            aria-label={`Индекс здоровья кожи: ${latestScore} из 100`}
          >
            <circle
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_R}
              fill="none"
              stroke="var(--border)"
              strokeWidth="6"
            />
            <motion.circle
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_R}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeDasharray={gaugeDash}
              strokeLinecap="round"
              transform={`rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            />
            <text
              x={GAUGE_SIZE / 2}
              y={GAUGE_SIZE / 2 + 7}
              textAnchor="middle"
              fontSize="20"
              fontWeight={700}
              fill="var(--text)"
              dominantBaseline="alphabetic"
            >
              {latestScore}
            </text>
          </svg>
          {/* /100 unit annotation removed 2026-06-29 — its previous
              `bottom: -2` position overlapped the lower arc of the
              ring (the ring's outer edge ends at y=67; the "/100"
              div's text box started at y≈62). The score's context
              (/100) is implicit from the chart Y-axis labels. */}
        </div>

        {/* Chart */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {scored.length >= 2 ? (                <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              style={{ width: "100%", height: "auto", display: "block" }}
            >
              {/* baseline at y=Y_MIN (which is auto-fit floor, usually 0) */}
              <line
                x1={PADDING.left}
                y1={toY(Y_MIN)}
                x2={CHART_WIDTH - PADDING.right}
                y2={toY(Y_MIN)}
                stroke="var(--border)"
                strokeWidth="0.5"
              />
              {/* threshold guides (50, 80) for color-zone intuitive reading;
                  only render if the guide falls inside the current Y range
                  (auto-fit may exclude 50 / 80 on concentrated histories). */}
              {[50, 80].filter((v) => v >= Y_MIN && v <= Y_MAX).map((v) => (
                <line
                  key={v}
                  x1={PADDING.left}
                  y1={toY(v)}
                  x2={CHART_WIDTH - PADDING.right}
                  y2={toY(v)}
                  stroke="var(--border)"
                  strokeWidth="0.5"
                  strokeDasharray="2 3"
                  opacity={0.6}
                />
              ))}

              {/* Y-axis labels — auto-fit. The TOP label (Y_MAX) is
                  pinned at viewBox y=0..12, y=4 text centre, so digit
                  ink at y≈0..8 leaves a guaranteed ≥4px breathing gap
                  before any label below it (this is the same trick we
                  previously used to keep "80"/"50" from kissing).
                  Mid/bottom labels render at slots [0.33, 0.66] along
                  the Y range and skip if they collide with the
                  pinned top label's zone (cy < 14). Each digit glyph
                  is masked by a card-coloured rect so any dashed
                  gridline that crosses the position does not bisect
                  the digit horizontally. fontSize 11 ≈ 8.7 CSS px on
                  a ~260px-wide phone viewport — legible without
                  zooming. "0"-axis label dropped; the y=Y_MIN baseline
                  line self-evidently marks the floor. */}
              <rect x={PADDING.left - 22} y="0" width="18" height="12" style={{ fill: "var(--bg-card)" }} />
              <text x={PADDING.left - 4} y="4" textAnchor="end" fontSize="11" fill="var(--text-muted)" dominantBaseline="central">{Y_MAX}</text>
              {[0.33, 0.66].map((frac) => {
                const v = Math.round(Y_MIN + (Y_MAX - Y_MIN) * frac);
                const cy = toY(v);
                if (cy < 14) return null;
                return (
                  <React.Fragment key={`mid-${v}`}>
                    <rect x={PADDING.left - 20} y={cy - 6} width="18" height="12" style={{ fill: "var(--bg-card)" }} />
                    <text x={PADDING.left - 4} y={cy} textAnchor="end" fontSize="11" fill="var(--text-muted)" dominantBaseline="central">{v}</text>
                  </React.Fragment>
                );
              })}

              {/* filled area below line */}
              <defs>
                <linearGradient id="shiGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.path
                d={areaPath}
                fill="url(#shiGradient)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
              />

              {/* line */}
              <motion.path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />

              {/* dots */}
              {scored.map((d, i) => (
                <motion.circle
                  key={`dot-${i}`}
                  cx={toX(i)}
                  cy={toY(d.result!.skin_score)}
                  r="2.5"
                  fill="white"
                  stroke={color}
                  strokeWidth="1.5"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.04 }}
                />
              ))}

              {/* date labels (sparse by density) */}
              {showLabelIndices.map((i) => (
                <text
                  key={`lbl-${i}`}
                  x={toX(i)}
                  y={CHART_HEIGHT - 4}
                  textAnchor={i === 0 ? "start" : i === scored.length - 1 ? "end" : "middle"}
                  fontSize="8"
                  fill="var(--text-muted)"
                >
                  {formatRuDate(scored[i].createdAt)}
                </text>
              ))}
            </svg>
          ) : (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "16px 8px",
              }}
            >
              График появится после следующего анализа
            </div>
          )}
        </div>
      </div>

      {/* Bottom — gauge caption + stats row */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          background: `${color}10`,
          color,
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        {scoreLabel(latestScore)}
      </div>

      {scored.length >= 2 && (
        /* 2026-06-29 — switched from `flex justify-around` (which had no
            guarantee that "Средний" / "Лучший" / "Худший" wouldn't kiss on
            narrow viewports because each column auto-sizes to its label's
            intrinsic width) to a CSS grid with three equal 1fr columns +
            `gap: 12px`. Each cell now claims exactly 1/3 of the row width
            and centres its stack of number/label via flex-col with a 2px
            inner gap. Labels can no longer overlap, no matter how wide the
            Russian word. */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            columnGap: 12,
            paddingTop: 10,
            marginTop: 4,
            borderTop: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          {([
            { num: avg, label: "Средний", color: "var(--text)" },
            { num: max, label: "Лучший", color: "#3F9143" },
            { num: min, label: "Худший", color: "#E07A8E" },
          ] as const).map((c) => (
            <div
              key={c.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.num}</span>
              <span style={{ fontSize: 10, opacity: 0.85, whiteSpace: "nowrap" }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
