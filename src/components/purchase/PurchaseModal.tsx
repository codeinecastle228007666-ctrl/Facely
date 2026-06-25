"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";

type Tier = "single" | "pack5" | "monthly";

interface TierDef {
  id: Tier;
  icon: string;
  title: string;
  desc: string;
  price: number;
  badge?: string;
  savings?: string;
}

const TIERS: TierDef[] = [
  {
    id: "single",
    icon: "🌱",
    title: "1 Анализ кожи",
    desc: "Разовый анализ — тип кожи, проблемы и рекомендации",
    price: Number(process.env.NEXT_PUBLIC_TIER_PRICE_SINGLE || "150"),
  },
  {
    id: "pack5",
    icon: "✨",
    title: "5 Анализов кожи",
    desc: "Для регулярного отслеживания динамики кожи",
    price: Number(process.env.NEXT_PUBLIC_TIER_PRICE_PACK5 || "500"),
    badge: "ПОПУЛЯРНО",
    savings: "Экономия 35%",
  },
  {
    id: "monthly",
    icon: "👑",
    title: "Безлимит на месяц",
    desc: "Все анализы без ограничений + приоритетная поддержка",
    price: Number(process.env.NEXT_PUBLIC_TIER_PRICE_MONTHLY || "1200"),
  },
];

const CARD_NUMBER = process.env.NEXT_PUBLIC_CARD_NUMBER || "";
const CARD_BANK = process.env.NEXT_PUBLIC_CARD_BANK || "Сбербанк";

function pluralRubles(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "рубль";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "рубля";
  return "рублей";
}

interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState<Tier | null>(null);
  const [prices, setPrices] = useState<{
    analysis: number;
    currency: string;
    isStars: boolean;
  } | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [cardCopied, setCardCopied] = useState(false);
  const [cardPaid, setCardPaid] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);

  useEffect(() => {
    api.subscription.prices().then(setPrices).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedTier(null);
      setCardCopied(false);
      setCardPaid(false);
      setCardSubmitting(false);
      setLoading(null);
    }
  }, [open]);

  const copyCardNumber = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CARD_NUMBER);
      setCardCopied(true);
      setTimeout(() => setCardCopied(false), 3000);
    } catch {
      prompt("Номер карты:", CARD_NUMBER);
    }
  }, []);

  const handleCardPaid = useCallback(async () => {
    if (!selectedTier) return;
    const tierDef = TIERS.find((t) => t.id === selectedTier);
    if (!tierDef) return;
    setCardSubmitting(true);
    try {
      await api.subscription.reportCardTransfer({ amount: tierDef.price, tier: selectedTier });
      setCardPaid(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch {
      alert("Не удалось отправить уведомление. Пожалуйста, напишите в поддержку или попробуйте позже.");
    } finally {
      setCardSubmitting(false);
    }
  }, [selectedTier, onSuccess, onClose]);

  const handleStarsPurchase = async (tier: Tier) => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) {
      alert("Доступно только в Telegram");
      return;
    }
    if (tier === "monthly") {
      alert("Безлимит пока оплачивается переводом на карту. Telegram Stars для подписки — скоро.");
      return;
    }
    const quantity = tier === "single" ? 1 : 5;
    setLoading(tier);
    try {
      const res = await api.subscription.createStarsInvoice({ quantity });
      tg.openInvoice(res.url, async (status: string) => {
        if (status === "paid") {
          alert("Оплата прошла! Анализы будут зачислены в течение минуты.");
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 1000);
        }
        setLoading(null);
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка оплаты");
      setLoading(null);
    }
  };

  // Stars-цена для UI: 1 анализ = prices.analysis ★; пакет 5 = с 35% скидкой.
  const starsPriceFor = (qty: number, bulk: boolean) => {
    if (!prices) return qty;
    const base = prices.analysis * qty;
    return bulk ? Math.round(base * 0.65) : base;
  };

  const selectedTierDef = selectedTier ? TIERS.find((t) => t.id === selectedTier) : undefined;

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
            {selectedTier === null ? (
              <>
                <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>Пополнить баланс</h3>
                  <button onClick={onClose}>
                    <CloseIcon size={22} />
                  </button>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.5 }}>
                  Выберите тариф — чем больше анализов, тем больше экономия.
                </div>

                <div className="flex flex-col gap-3">
                  {TIERS.map((tier, i) => {
                    const isPopular = tier.id === "pack5";
                    const perAnalysis =
                      tier.id === "single"
                        ? null
                        : tier.id === "pack5"
                        ? `за 5 анализов · ${Math.round(tier.price / 5)} ₽/анализ`
                        : "все анализы за месяц";
                    return (
                      <motion.div
                        key={tier.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        style={{
                          padding: 18,
                          borderRadius: 18,
                          background: isPopular ? "rgba(255, 215, 0, 0.06)" : "var(--bg-card)",
                          border: isPopular ? "2px solid #FFD700" : "1px solid var(--border)",
                          position: "relative",
                          boxShadow: "var(--shadow)",
                        }}
                      >
                        {tier.badge && (
                          <span
                            style={{
                              position: "absolute",
                              top: 10,
                              right: 10,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: 0.5,
                              padding: "3px 10px",
                              borderRadius: 20,
                              background: "#FFD700",
                              color: "white",
                              zIndex: 2,
                            }}
                          >
                            {tier.badge}
                          </span>
                        )}
                        <div className="flex items-start gap-3" style={{ marginBottom: 12 }}>
                          <span style={{ fontSize: 28, lineHeight: 1 }}>{tier.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>{tier.title}</div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                              {tier.desc}
                            </div>
                            {tier.savings && (
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#7EC4D8",
                                  marginTop: 6,
                                  background: "rgba(126, 196, 216, 0.12)",
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  display: "inline-block",
                                }}
                              >
                                {tier.savings}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>
                            {tier.price} ₽
                          </div>
                          {perAnalysis && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {perAnalysis}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {prices?.isStars && tier.id !== "monthly" && (
                            <motion.button
                              whileTap={{ scale: 0.97 }}
                              onClick={() => handleStarsPurchase(tier.id)}
                              disabled={loading === tier.id}
                              style={{
                                flex: 1,
                                padding: "12px",
                                borderRadius: 12,
                                border: "none",
                                background: "linear-gradient(135deg, #FFD700, #FFA500)",
                                color: "white",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: loading === tier.id ? "wait" : "pointer",
                                opacity: loading === tier.id ? 0.7 : 1,
                              }}
                            >
                              {loading === tier.id
                                ? "Открываем..."
                                : `⭐ ${starsPriceFor(tier.id === "single" ? 1 : 5, tier.id === "pack5")}`}
                            </motion.button>
                          )}
                          {CARD_NUMBER && (
                            <motion.button
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setSelectedTier(tier.id)}
                              style={{
                                flex: 1,
                                padding: "12px",
                                borderRadius: 12,
                                border: "1px solid #4CAF50",
                                background: "rgba(76, 175, 80, 0.08)",
                                color: "#2E7D32",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                              }}
                            >
                              💳 Картой
                            </motion.button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    marginTop: 16,
                    lineHeight: 1.5,
                  }}
                >
                  Оплата переводом на карту проверяется вручную — обычно в течение часа.
                  <br />
                  Если есть вопросы — напишите в поддержку.
                </div>
              </>
            ) : cardPaid ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Заявка принята!</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                  {selectedTierDef?.title} будет активирован после проверки платежа (обычно в течение часа).
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setSelectedTier(null)}
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 13,
                    color: "var(--primary-dark)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                    padding: "4px 0",
                  }}
                >
                  ← К тарифам
                </button>

                <div
                  style={{
                    padding: "20px 16px",
                    borderRadius: 16,
                    background:
                      "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                    color: "white",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      opacity: 0.7,
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    {CARD_BANK}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      marginBottom: 4,
                      opacity: 0.85,
                    }}
                  >
                    {selectedTierDef?.title}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: 2,
                      fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
                      marginBottom: 16,
                      wordBreak: "break-all",
                    }}
                  >
                    {CARD_NUMBER.replace(/(\d{4})(?=\d)/g, "$1 ")}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      opacity: 0.6,
                      marginBottom: 16,
                    }}
                  >
                    <span>Сумма к оплате</span>
                    <span style={{ fontWeight: 700, opacity: 1, color: "#4CAF50" }}>
                      {selectedTierDef?.price} {pluralRubles(selectedTierDef?.price ?? 0)}
                    </span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={copyCardNumber}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 12,
                      background: cardCopied ? "#4CAF50" : "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {cardCopied ? "Номер скопирован!" : "Скопировать номер карты"}
                  </motion.button>
                </div>

                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "var(--bg)",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                    📋 Инструкция
                  </div>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    <li style={{ marginBottom: 4 }}>
                      Скопируйте номер карты и переведите{" "}
                      <strong>
                        {selectedTierDef?.price} {pluralRubles(selectedTierDef?.price ?? 0)}
                      </strong>
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      В комментарии к переводу укажите:{" "}
                      <strong>Reveli {selectedTier}</strong>
                    </li>
                    <li style={{ marginBottom: 4 }}>Нажмите «Я оплатил(а)» ниже</li>
                    <li>
                      {selectedTier === "monthly"
                        ? "Подписка активируется после проверки (в течение часа)"
                        : "Анализы зачислятся после проверки (обычно в течение часа)"}
                    </li>
                  </ol>
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCardPaid}
                  disabled={cardSubmitting}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: 16,
                    background: cardSubmitting
                      ? "var(--border)"
                      : "linear-gradient(135deg, #4CAF50, #2E7D32)",
                    color: "white",
                    fontSize: 15,
                    fontWeight: 600,
                    border: "none",
                    cursor: cardSubmitting ? "default" : "pointer",
                  }}
                >
                  {cardSubmitting ? "Отправляем..." : "Я оплатил(а)"}
                </motion.button>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  Если возникнут вопросы — напишите в поддержку
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
