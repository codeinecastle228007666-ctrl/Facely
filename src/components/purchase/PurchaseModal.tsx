"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CheckIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";

interface PurchaseOption {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  priceLabel: string;
  features: string[];
  color: string;
  bgColor: string;
  popular?: boolean;
  action: () => Promise<any>;
}

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

  const options: PurchaseOption[] = [
    {
      id: "analysis_1",
      title: "1 анализ",
      subtitle: "Разовый анализ",
      price: "100",
      priceLabel: "\u20BD",
      color: "#A8D8EA",
      bgColor: "rgba(168, 216, 234, 0.1)",
      features: ["1 анализ кожи", "Полный отчёт", "Рекомендации"],
      action: async () => {
        const res = await api.subscription.purchaseAnalysis({ quantity: 1 });
        alert(`Куплен 1 анализ! +${res.xpGained} XP`);
      },
    },
    {
      id: "analysis_5",
      title: "5 анализов",
      subtitle: "Для регулярного ухода",
      price: "400",
      priceLabel: "\u20BD",
      color: "#FFB4A2",
      bgColor: "rgba(255, 180, 162, 0.1)",
      popular: true,
      features: ["5 анализов кожи", "Детальный разбор", "Персональная рутина"],
      action: async () => {
        const res = await api.subscription.purchaseAnalysis({ quantity: 5 });
        alert(`Куплено 5 анализов! +${res.xpGained} XP`);
      },
    },
    {
      id: "subscription",
      title: "PRO подписка",
      subtitle: "Полный уход на месяц",
      price: "500",
      priceLabel: "\u20BD/мес",
      color: "#FFD700",
      bgColor: "rgba(255, 215, 0, 0.08)",
      features: [
        "Безлимит анализов",
        "Еженедельный отчёт",
        "Приоритетная поддержка",
      ],
      action: async () => {
        const res = await api.subscription.purchaseSubscription();
        alert(`Подписка оформлена! +${res.xpGained} XP`);
      },
    },
  ];

  const handleSelect = async (option: PurchaseOption) => {
    setLoading(option.id);
    try {
      await option.action();
      onSuccess?.();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка покупки");
    } finally {
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
              {options.map((opt, i) => (
                <motion.button
                  key={opt.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelect(opt)}
                  disabled={loading === opt.id}
                  style={{
                    width: "100%",
                    padding: "18px",
                    borderRadius: 18,
                    border: `2px solid ${opt.popular ? opt.color : "var(--border)"}`,
                    background: opt.bgColor,
                    textAlign: "left",
                    cursor: loading === opt.id ? "wait" : "pointer",
                    position: "relative",
                    opacity: loading === opt.id ? 0.7 : 1,
                  }}
                >
                  {opt.popular && (
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
                      Популярное
                    </span>
                  )}

                  <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {opt.subtitle}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{opt.price}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {opt.priceLabel}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    {opt.features.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-2">
                        <CheckIcon size={16} />
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {f}
                        </span>
                      </div>
                    ))}
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
