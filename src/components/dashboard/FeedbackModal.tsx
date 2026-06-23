"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onClose }) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("Не удалось отправить. Попробуйте позже.");
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => { if (!sending) { onClose(); setSent(false); setText(""); setError(""); } }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ background: "white", width: "100%", maxWidth: 430, borderRadius: "24px 24px 0 0", padding: "24px 20px 32px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>{sent ? "Спасибо!" : "Обратная связь"}</h3>
              <button onClick={() => { onClose(); setSent(false); setText(""); setError(""); }}><CloseIcon size={22} /></button>
            </div>

            {sent ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Спасибо за отзыв! Мы прочитаем и учтём его при доработках.
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
                  Расскажите, что вам нравится, что неудобно или чего не хватает. Мы читаем каждый отзыв.
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ваши пожелания, идеи, замечания..."
                  rows={5}
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, resize: "none", marginBottom: 12, background: "var(--bg)" }}
                />
                {error && (
                  <div style={{ marginBottom: 12, fontSize: 13, color: "#E07A8E", textAlign: "center" }}>{error}</div>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={sending || !text.trim()}
                  style={{ width: "100%", padding: "16px", borderRadius: 16, background: sending || !text.trim() ? "var(--border)" : "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: sending || !text.trim() ? "default" : "pointer" }}
                >
                  {sending ? "Отправляем..." : "Отправить"}
                </motion.button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
