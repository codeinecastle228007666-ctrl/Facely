"use client";

import React from "react";
import { motion } from "framer-motion";
import type { AnalysisHistoryItem } from "@/services/api";
import { pluralRu } from "@/lib/pluralRu";

interface LastAnalysisCardProps {
  item: AnalysisHistoryItem | null;
}

const MOOD_COLORS: Record<string, { bg: string; text: string }> = {
  позитивный: { bg: "rgba(168, 216, 234, 0.12)", text: "#7EC4D8" },
  нейтральный: { bg: "rgba(255, 180, 162, 0.12)", text: "#E89B87" },
  тревожный: { bg: "rgba(232, 160, 180, 0.12)", text: "#E07A8E" },
};

const MOOD_ADJECTIVE: Record<string, string> = {
  позитивный: "хорошая",
  нейтральный: "нормальная",
  тревожный: "плохая",
};

// 2026-06-27 — severity-ordered ranking for surfacing the top-1 problem
// inside the card title. Mirrors WhatWeGet from analysisService:parseProblem
// — same regex shape for "Name (severity)" problem strings compiled by
// facePlus/gemini/huggingFace services.
const SEVERITY_ORDER: Record<string, number> = {
  выраженное: 3,
  умеренное: 2,
  лёгкое: 1,
};

// Parse a Face++/Gemini/HuggingFace problem string of the form
// "Сыпь (умеренное)" → { name: "Сыпь", severity: "умеренное" }.
// Falls back to { name, severity: null } when the string has no
// severity tag — old records (pre-2026-06) occasionally ship those.
function parseProblem(p: string): { name: string; severity: string | null } {
  const m = p.match(/^(.+?)\s*\((лёгкое|умеренное|выраженное)\)\s*$/);
  return m ? { name: m[1].trim(), severity: m[2].trim() } : { name: p.trim(), severity: null };
}

// Mirror of badge thresholds in resultModal.tsx + history/page.tsx so
// the score chip on the home-page card reads consistent with the data
// the user sees after clicking through. Green ≥80 / amber ≥50 / red <50.
function scoreBadge(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: "rgba(76, 175, 80, 0.14)", text: "#3F9143" };
  if (score >= 50) return { bg: "rgba(255, 152, 0, 0.14)", text: "#C97700" };
  return { bg: "rgba(224, 122, 142, 0.14)", text: "#E07A8E" };
}

export const LastAnalysisCard: React.FC<LastAnalysisCardProps> = ({ item }) => {
  if (!item || !item.result) return null;

  const mood = item.result.mood;
  const mc = MOOD_COLORS[mood] || MOOD_COLORS.нейтральный;
  const daysAgo = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000);
  const adjective = MOOD_ADJECTIVE[mood] || "неопределённая";

  // 2026-06-27 (round 4) — Top-1 problem by severity + skin_score chip.
  // Builds on the prior 3-step title hardening:
  //   round 1:  "Вчера" / "Сегодня" / "N дней назад"
  //   round 2:  + "Состояние кожи [когда]"
  //   round 3:  + mood-adjective + problem count
  //   round 4:  + top-1 problem name+severity + "{N}/100" chip
  // The card now carries concrete analysis data the user can act on
  // (which problem, how severe, what score) instead of generic mood.
  const parsed = item.result.problems.map(parseProblem);
  const sorted = parsed.slice().sort(
    (a, b) =>
      (SEVERITY_ORDER[b.severity || ""] || 0) -
      (SEVERITY_ORDER[a.severity || ""] || 0),
  );
  const top = sorted[0];
  const others = parsed.length - 1;

  // Inline problem detail string. Examples:
  //   0 problems → "без проблем"
  //   1 problem, "Акне", severe → "Акне выраженное"
  //   3 problems, top "Сухость" severe → "Сухость выраженная + ещё 2"
  //   2 problems, both un-tagged → "Сыпь + ещё 1"
  let problemDetail: string;
  if (parsed.length === 0) {
    problemDetail = "без проблем";
  } else if (top?.severity) {
    problemDetail =
      others > 0
        ? `${top.name} ${top.severity} + ещё ${others}`
        : `${top.name} ${top.severity}`;
  } else {
    problemDetail = others > 0 ? `${top.name} + ещё ${others}` : `${top.name}`;
  }

  const whenText =
    daysAgo === 0
      ? "Сегодня"
      : daysAgo === 1
        ? "Вчера"
        : `${daysAgo} ${pluralRu(daysAgo, ["день", "дня", "дней"])} назад`;

  const titleText = `${whenText}, кожа ${adjective}, ${problemDetail}`;

  // score is computed server-side and mirrored onto result.skin_score on
  // every analyze() call. Older records (<2026-06) may omit it; guard.
  const score = item.result.skin_score;
  const sb = typeof score === "number" ? scoreBadge(score) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: mc.bg,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}
      >
        {mood === "позитивный" ? "😊" : mood === "тревожный" ? "😟" : "😐"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{titleText}</span>
          {sb && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 8,
                background: sb.bg,
                color: sb.text,
                flexShrink: 0,
              }}
              title={
                score >= 80
                  ? "Отличное состояние кожи"
                  : score >= 50
                    ? "Требует внимания"
                    : "Нужен уход"
              }
            >
              {score}/100
            </span>
          )}
          {item.skinType && (
            <span
              style={{
                fontSize: 11,
                padding: "1px 10px",
                borderRadius: 12,
                background: "var(--primary-light)",
                color: "var(--primary-dark)",
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {item.skinType}
            </span>
          )}
        </div>
      </div>
      {daysAgo === 0 && (
        <div
          style={{
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 8,
            background: "rgba(126, 196, 216, 0.12)",
            color: "#7EC4D8",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          NEW
        </div>
      )}
    </motion.div>
  );
};
