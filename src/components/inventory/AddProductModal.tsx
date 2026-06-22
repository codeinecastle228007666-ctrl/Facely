"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "choose" | "photo" | "manual";

const STEPS: { key: Step; icon: string; title: string; desc: string; disabled?: boolean }[] = [
  { key: "photo", icon: "📷", title: "Фото состава — в работе", desc: "Сфотографируйте состав на упаковке — ИИ прочитает текст", disabled: true },
  { key: "manual", icon: "✏️", title: "Ввести вручную", desc: "Введите название и состав средства" },
];

export const AddProductModal: React.FC<AddProductModalProps> = ({ open, onClose, onSuccess }) => {
  const [step, setStep] = useState<Step | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [error, setError] = useState("");

  const reset = () => { setStep(null); setName(""); setBrand(""); setIngredients(""); setError(""); };

  const handleSubmit = async () => {
    setError("");
    try {
      if (!name.trim()) { setError("Введите название средства"); return; }
      await api.inventory.add({ source: "manual", name, brand: brand || undefined, ingredients: ingredients || undefined });
      onSuccess();
      reset();
      onClose();
    } catch { setError("Ошибка при добавлении"); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => { onClose(); reset(); }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ background: "white", width: "100%", maxWidth: 430, borderRadius: "24px 24px 0 0", padding: "24px 20px 32px", maxHeight: "85vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>{step ? "Добавить средство" : "Добавить в инвентарь"}</h3>
              <button onClick={() => { onClose(); reset(); }}><CloseIcon size={22} /></button>
            </div>

            {!step && (
              <div className="flex flex-col gap-3">
                {STEPS.map((s) => (
                  <motion.button
                    key={s.key}
                    whileTap={s.disabled ? {} : { scale: 0.97 }}
                    onClick={() => { if (!s.disabled) setStep(s.key); }}
                    className="flex items-center gap-3"
                    style={{ padding: "14px 16px", borderRadius: 16, background: s.disabled ? "var(--border)" : "var(--bg)", border: "none", cursor: s.disabled ? "default" : "pointer", textAlign: "left", width: "100%", opacity: s.disabled ? 0.5 : 1 }}
                  >
                    <span style={{ fontSize: 28 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.desc}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </motion.button>
                ))}
              </div>
            )}

            {step === "manual" && (
              <div>
                <input placeholder="Название средства *" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
                <input placeholder="Бренд (необязательно)" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
                <textarea placeholder="Состав (скопируйте INCI-состав с упаковки)" value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={4} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, resize: "none", marginBottom: 12, background: "var(--bg)" }} />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  style={{ width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}
                >
                  Добавить
                </motion.button>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(232, 160, 180, 0.1)", fontSize: 13, color: "#E07A8E", textAlign: "center" }}>
                {error}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};