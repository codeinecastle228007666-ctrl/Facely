"use client";

import React from "react";
import { motion } from "framer-motion";

interface DataPoint {
  label: string;
  value: number;
  value2?: number;
  mood?: string;
}

interface DynamicsChartProps {
  data: DataPoint[];
  line1Label?: string;
  line2Label?: string;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 140;
const PADDING = { top: 20, right: 16, bottom: 30, left: 30 };

export const DynamicsChart: React.FC<DynamicsChartProps> = ({ data, line1Label = "Состояние", line2Label = "Проблемы" }) => {
  const allValues = data.flatMap((d) => [d.value, d.value2 ?? 0]);
  const maxVal = Math.max(...allValues, 10);
  const minVal = Math.min(...allValues);
  const range = (maxVal - minVal) || 1;
  const paddedMin = minVal - range * 0.1;
  const paddedMax = maxVal + range * 0.1;
  const paddedRange = paddedMax - paddedMin;

  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const toX = (i: number) => PADDING.left + (data.length > 1 ? (i / (data.length - 1)) * plotWidth : plotWidth / 2);
  const toY = (v: number) => PADDING.top + plotHeight - ((v - paddedMin) / paddedRange) * plotHeight;

  const line1Path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.value)}`).join(" ");
  const line2Path = data.some((d) => d.value2 !== undefined)
    ? data.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.value2 ?? 0)}`).join(" ")
    : null;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => paddedMin + (paddedRange / (yTicks - 1)) * i);

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ marginBottom: 12 }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
        Динамика состояния кожи
      </h3>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ width: "100%", height: "auto", overflow: "visible" }}
      >
        {/* Grid lines */}
        {yTickValues.map((v, i) => (
          <line
            key={i}
            x1={PADDING.left}
            y1={toY(v)}
            x2={CHART_WIDTH - PADDING.right}
            y2={toY(v)}
            stroke="var(--border)"
            strokeWidth="0.5"
            strokeDasharray="3 3"
          />
        ))}

        {/* Y axis labels */}
        {yTickValues.map((v, i) => (
          <text
            key={i}
            x={PADDING.left - 6}
            y={toY(v) + 4}
            textAnchor="end"
            fontSize="8"
            fill="var(--text-muted)"
          >
            {Math.round(v)}
          </text>
        ))}

        {/* X axis labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={toX(i)}
            y={CHART_HEIGHT - 4}
            textAnchor="middle"
            fontSize="8"
            fill="var(--text-muted)"
          >
            {d.label}
          </text>
        ))}

        {/* Line 1 */}
        <motion.path
          d={line1Path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />

        {/* Line 1 dots */}
        {data.map((d, i) => (
          <motion.circle
            key={`d1-${i}`}
            cx={toX(i)}
            cy={toY(d.value)}
            r="3.5"
            fill="var(--primary)"
            stroke="white"
            strokeWidth="1.5"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 + i * 0.1 }}
          />
        ))}

        {/* Line 2 */}
        {line2Path && (
          <motion.path
            d={line2Path}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
          />
        )}

        {/* Line 2 dots */}
        {line2Path && data.map((d, i) => (
          <motion.circle
            key={`d2-${i}`}
            cx={toX(i)}
            cy={toY(d.value2 ?? 0)}
            r="3.5"
            fill="var(--secondary)"
            stroke="white"
            strokeWidth="1.5"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 + i * 0.1 }}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex justify-center" style={{ marginTop: 14, gap: 20 }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)" }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{line1Label}</span>
        </div>
        {line2Path && (
          <div className="flex items-center gap-2">
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--secondary)" }} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{line2Label}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};
