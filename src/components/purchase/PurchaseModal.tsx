"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CheckIcon } from "@/components/ui/Icons";

interface Tariff {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  priceLabel: string;
  features: string[];
  color: string;
  bgColor: string;
  popular?: boolean;
}

const TARIFFS: Tariff[] = [
  {
    id: "starter",
    title: "Стартовый",
    subtitle: "Попробуй себя",
    price: "0",
    priceLabel: "Бесплатно",
    color: "#A8D8EA",
    bgColor: "rgba(168, 216, 234, 0.1)",
    features: ["3 анализа кожи", "Определение типа кожи", "Базовые рекомендации"],
  },
  {
    id: "pack10",
    title: "Пакет 10",
    subtitle: "Для регулярного ухода",
    price: "300",
    priceLabel: "₽",
    color: "#FFB4A2",
    bgColor: "rgba(255, 180, 162, 0.1)",
    popular: true,
    features: [
      "10 анализов кожи",
      "Детальный разбор проблем",
      "Персональная рутина",
    ],
  },
  {
    id: "pro",
    title: "PRO подписка",
    subtitle: "Полный уход",
    price: "500",
    priceLabel: "₽/мес",
    color: "#FFD700",
    bgColor: "rgba(255, 215, 0, 0.08)",
    features: [
      "Безлимит анализов",
      "Еженедельный отчёт",
      "Приоритетная поддержка",
    ],
  },
];

interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (tariffId: string) => void;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({
  open,
  onClose,
  onSelect,
}) => {
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
              {TARIFFS.map((tariff, i) => (
                <motion.button
                  key={tariff.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelect(tariff.id)}
                  style={{
                    width: "100%",
                    padding: "18px",
                    borderRadius: 18,
                    border: `2px solid ${tariff.popular ? tariff.color : "var(--border)"}`,
                    background: tariff.bgColor,
                    textAlign: "left",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {tariff.popular && (
                    <span
                      style={{
                        position: "absolute",
                        top: -8,
                        right: 16,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 10px",
                        borderRadius: 20,
                        background: tariff.color,
                        color: "white",
                      }}
                    >
                      Популярное
                    </span>
                  )}

                  <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{tariff.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {tariff.subtitle}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{tariff.price}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {tariff.priceLabel}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    {tariff.features.map((f, fi) => (
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
