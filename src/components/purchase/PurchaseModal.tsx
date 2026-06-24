"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CheckIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";

interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [prices, setPrices] = useState<{
    analysis: number;
    currency: string;
    isStars: boolean;
  } | null>(null);

  useEffect(() => {
    api.subscription.prices().then(setPrices).catch(() => {});
  }, [open]);

  const formatPrice = (amount: number) => {
    if (!prices) return "1";
    if (prices.isStars) return String(amount);
    return (amount / 100).toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const formatCurrency = () => {
    if (!prices) return "⭐";
    return prices.isStars ? "⭐" : "₽";
  };

  const handleStarsPurchase = async () => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) {
      alert("Доступно только в Telegram");
      return;
    }
    setLoading("analysis_1");
    try {
      const res = await api.subscription.createStarsInvoice({ quantity: 1 });
      tg.openInvoice(res.url, async (status: string) => {
        if (status === "paid") {
          alert("Оплата прошла! Анализы будут зачислены в течение минуты.");
          setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
        }
        setLoading(null);
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка оплаты");
      setLoading(null);
    }
  };

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
            zIndex: 200,
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
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{
              background: "white",
              width: "100%",
              maxWidth: 430,
              borderRadius: "24px 24px 0 0",
              padding: "24px 20px 32px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Пополнить баланс</h3>
              <button onClick={onClose}>
                <CloseIcon size={22} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStarsPurchase}
                disabled={loading === "analysis_1"}
                style={{
                  width: "100%",
                  padding: "18px",
                  borderRadius: 18,
                  border: "2px solid #FFD700",
                  background: "rgba(255, 215, 0, 0.08)",
                  textAlign: "left",
                  cursor: loading === "analysis_1" ? "wait" : "pointer",
                  opacity: loading === "analysis_1" ? 0.7 : 1,
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -8,
                    right: 16,
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 10px",
                    borderRadius: 20,
                    background: "#FFD700",
                    color: "white",
                  }}
                >
                  {prices?.isStars ? "Telegram Stars" : "Банковская карта"}
                </span>
                <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>1 анализ</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Разовый анализ кожи
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                      {formatPrice(prices?.analysis ?? 1)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {formatCurrency()}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {["1 анализ кожи", "Полный отчёт", "Рекомендации"].map((f, fi) => (
                    <div key={fi} className="flex items-center gap-2">
                      <CheckIcon size={16} />
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f}</span>
                    </div>
                  ))}
                </div>
              </motion.button>

              {[
                { id: "analysis_5", title: "5 анализов", subtitle: "Для регулярного ухода", price: "200", desc: "5 анализов кожи, детальный разбор, персональная рутина", badge: "Скоро", color: "#FFB4A2", bgColor: "rgba(255, 180, 162, 0.1)" },
                { id: "subscription", title: "PRO подписка", subtitle: "Полный уход на месяц", price: "500", desc: "Безлимит анализов, еженедельный отчёт, приоритетная поддержка", badge: "Скоро", color: "#A8D8EA", bgColor: "rgba(168, 216, 234, 0.1)" },
              ].map((opt, i) => (
                <motion.button
                  key={opt.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (i + 1) * 0.08 }}
                  style={{
                    width: "100%",
                    padding: "18px",
                    borderRadius: 18,
                    border: "2px solid var(--border)",
                    background: opt.bgColor,
                    textAlign: "left",
                    cursor: "not-allowed",
                    opacity: 0.6,
                    position: "relative",
                  }}
                  disabled
                >
                  <span
                    style={{
                      position: "absolute",
                      top: -8,
                      right: 16,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 10px",
                      borderRadius: 20,
                      background: opt.color,
                      color: "white",
                    }}
                  >
                    {opt.badge}
                  </span>
                  <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{opt.subtitle}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-muted)" }}>{opt.price}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>⭐/мес</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    {opt.desc}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
