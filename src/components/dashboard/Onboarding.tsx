"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const KEY = "facely_onboarding_shown";

const slides = [
  {
    icon: "🧬",
    title: "AI-диагностика кожи",
    desc: "Просто сфотографируй лицо — нейросеть Face++ проанализирует состояние кожи, выявит проблемы и даст рекомендации.",
  },
  {
    icon: "📊",
    title: "Отслеживай прогресс",
    desc: "Веди историю анализов, сравнивай результаты «до» и «после», следи за динамикой кожи.",
  },
  {
    icon: "💬",
    title: "Чат с косметологом AI",
    desc: "Задай любой вопрос об уходе — умный ассистент ответит на основе твоего анализа кожи.",
  },
  {
    icon: "🏆",
    title: "Игровая механика",
    desc: "Зарабатывай XP, открывай достижения, соревнуйся с друзьями в лидерборде и забирай награды.",
  },
  {
    icon: "🧴",
    title: "Инвентарь средств",
    desc: "Добавляй косметику по ссылке, фото состава или вручную. AI проанализирует ингредиенты, подскажет безопасность и совместимость с твоей кожей.",
  },
];

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
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {slides[slide].desc}
            </p>
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
