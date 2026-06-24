"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const moods = [
  { emoji: "😊", label: "Отлично", color: "#A8D8EA" },
  { emoji: "🙂", label: "Хорошо", color: "#A8D8EA" },
  { emoji: "😐", label: "Нормально", color: "#F5C4B0" },
  { emoji: "😟", label: "Плохо", color: "#E8A0B4" },
  { emoji: "😢", label: "Ужасно", color: "#E8A0B4" },
];

const STORAGE_KEY = "reveli_diary";

interface DiaryEntry {
  date: string;
  mood: number;
  note: string;
}

export const SkinDiary: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<DiaryEntry | null>(null);
  const [history, setHistory] = useState<DiaryEntry[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const all: DiaryEntry[] = JSON.parse(raw);
      setHistory(all);
      const todayStr = new Date().toISOString().slice(0, 10);
      const entry = all.find((e) => e.date === todayStr);
      if (entry) setToday(entry);
    }
  }, []);

  const save = (moodIdx: number, note: string) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const entry: DiaryEntry = { date: todayStr, mood: moodIdx, note };
    const existing = history.filter((e) => e.date !== todayStr);
    const updated = [...existing, entry].sort((a, b) => b.date.localeCompare(a.date));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setToday(entry);
    setHistory(updated);
    setOpen(false);
  };

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const entry = history.find((e) => e.date === dateStr);
    return { date: dateStr, day: d.toLocaleDateString("ru-RU", { weekday: "short" }), entry };
  });

  if (!open && !today) return null;

  return (
    <>
      {today ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
          style={{ marginBottom: 12, cursor: "pointer" }}
          onClick={() => setOpen(true)}
        >
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 28 }}>{moods[today.mood]?.emoji || "😊"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                Самочувствие кожи
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {today.note || moods[today.mood]?.label || "Нормально"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {weekDays.map((w) => (
                <div
                  key={w.date}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: w.entry ? moods[w.entry.mood]?.color || "var(--border)" : "var(--border)",
                    opacity: w.entry ? 1 : 0.4,
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card flex items-center justify-between"
          style={{ marginBottom: 12, cursor: "pointer", padding: "14px 16px" }}
          onClick={() => setOpen(true)}
        >
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            Как кожа сегодня?
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {moods.slice(0, 3).map((m, i) => (
              <span key={i} style={{ fontSize: 20 }}>{m.emoji}</span>
            ))}
          </div>
        </motion.div>
      )}

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 200,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{
              background: "white",
              width: "100%",
              maxWidth: 430,
              borderRadius: "24px 24px 0 0",
              padding: "24px 20px 32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Как себя чувствует твоя кожа?</h3>
            <div className="flex gap-2" style={{ marginBottom: 20 }}>
              {moods.map((m, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const note = prompt("Комментарий (необязательно):") || "";
                    save(i, note);
                  }}
                  style={{
                    flex: 1,
                    padding: "12px 6px",
                    borderRadius: 14,
                    border: today?.mood === i ? "2px solid var(--primary)" : "2px solid transparent",
                    background: today?.mood === i ? "var(--primary-light)" : "var(--bg)",
                    fontSize: 24,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    transition: "all 0.2s",
                  }}
                >
                  <span>{m.emoji}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.label}</span>
                </button>
              ))}
            </div>

            {history.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>История</div>
                <div className="flex flex-col gap-1">
                  {history.slice(0, 14).map((e) => (
                    <div key={e.date} className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      <span style={{ fontSize: 14 }}>{moods[e.mood]?.emoji || "❓"}</span>
                      <span style={{ minWidth: 90 }}>
                        {new Date(e.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>{e.note || moods[e.mood]?.label || ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </>
  );
};
