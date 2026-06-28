"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const KEY = "reveli_onboarding_shown";

/**
 * 2026-06-28 — `desc` widened from `string` to `string[]` so individual
 * slides can render multiple paragraphs (the gamification slide now has
 * intro + 3 label bullets — Уровни / Топ / Ачивки). Each string in the
 * array renders as a separate `<p>`; `<b>...</b>` markers are parsed
 * inline to wrap the enclosed text in `<strong>` (see `renderLine`).
 */
const slides: Array<{ icon: string; title: string; desc: string[] }> = [
  {
    icon: "🧬",
    title: "AI-анализ кожи",
    desc: [
      // 2026-06-28 — third-party provider name (Face++) and the
      // technical term «нейросеть» dropped from user-facing copy; the
      // promise is «AI анализирует», nothing about WHO or HOW. Keeps
      // onboarding aligned with the marketing voice (Reveli sells the
      // outcome, not the engine).
      "Просто сфотографируй лицо — AI проанализирует состояние кожи, выявит проблемы и даст рекомендации.",
    ],
  },
  {
    icon: "📊",
    title: "Отслеживай прогресс",
    desc: [
      "Веди историю анализов, сравнивай результаты «до» и «после», следи за динамикой кожи.",
    ],
  },
  {
    icon: "💬",
    title: "Чат с косметологом AI",
    desc: [
      "Задай любой вопрос об уходе — умный ассистент ответит на основе твоего анализа кожи.",
    ],
  },
  {
    icon: "🏆",
    // 2026-06-28 — title broadened from «Игровая механика» to spell out
    // the three pillars the user explicitly asked to surface («уровни и
    // топ и ачивки»). Sub-bullets below reuse the same vocabulary so the
    // first sight of the gamification loop names everything they can go
    // earn later.
    title: "Уровни, топ и ачивки",
    desc: [
      "Зарабатывай XP, открывай достижения, соревнуйся в лидерборде и забирай награды.",
      "🏅 <b>Уровни</b> — расти от Новичка до Мифа, 5 рамок в профиле",
      "🏆 <b>Топ</b> — лучшие рефереры / стрики / уровень, обновляется 1-го числа",
      "⭐ <b>Ачивки</b> — 9 достижений с XP-наградами, навсегда в профиле",
    ],
  },
  {
    icon: "🧴",
    title: "Инвентарь средств",
    desc: [
      "Добавляй косметику по ссылке, фото состава или вручную. AI проанализирует ингредиенты, подскажет безопасность и совместимость с твоей кожей.",
    ],
  },
];

/**
 * 2026-06-28 — Inline `<b>X</b>` parser. Splits on the markers (capture
 * group → odd-indexed parts are bold), wraps them in <strong>. Why a
 * custom mini-parser instead of `dangerouslySetInnerHTML`:
 *   - the only HTML we accept is `<b>`; everything else stays literal
 *     (defense against copy-paste mistakes on future slides);
 *   - SSR-style rendering works without `__html` quirks;
 *   - zero new dependencies.
 */
function renderLine(line: string): React.ReactNode {
  const parts = line.split(/<b>(.*?)<\/b>/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} style={{ fontWeight: 700 }}>{part}</strong> : part,
  );
}

export const Onboarding: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [show, setShow] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const shown = localStorage.getItem(KEY);
    if (!shown) setShow(true);
  }, []);

  const finish = () => {
    localStorage.setItem(KEY, "1");
    setShow(false);
    onDone();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            background: "white",
            zIndex: 600,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "40px 24px",
          }}
        >
          <motion.div
            key={slide}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 16,
              maxWidth: 340,
            }}
          >
            <span style={{ fontSize: 64 }}>{slides[slide].icon}</span>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>{slides[slide].title}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {slides[slide].desc.map((line, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {renderLine(line)}
                </p>
              ))}
            </div>
          </motion.div>

          <div style={{ display: "flex", gap: 6, marginTop: 32 }}>
            {slides.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === slide ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: i === slide ? "var(--primary)" : "var(--border)",
                  transition: "all 0.3s",
                }}
              />
            ))}
          </div>

          <div style={{ position: "absolute", bottom: 48, left: 24, right: 24, maxWidth: 430, margin: "0 auto" }}>
            {slide < slides.length - 1 ? (
              <div className="flex gap-2">
                <button
                  onClick={finish}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 16,
                    background: "transparent",
                    color: "var(--text-muted)",
                    fontSize: 14,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Пропустить
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSlide(slide + 1)}
                  style={{
                    flex: 1,
                    padding: "16px",
                    borderRadius: 16,
                    background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                    color: "white",
                    fontSize: 16,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Далее
                </motion.button>
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={finish}
                style={{
                  width: "100%",
                  padding: "16px",
                  borderRadius: 16,
                  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                  color: "white",
                  fontSize: 16,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Начать уход
              </motion.button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
