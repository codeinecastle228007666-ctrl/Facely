"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CheckIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";

interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CARD_NUMBER = process.env.NEXT_PUBLIC_CARD_NUMBER || "";
const CARD_BANK = process.env.NEXT_PUBLIC_CARD_BANK || "Сбербанк";
const CARD_AMOUNT = Number(process.env.NEXT_PUBLIC_CARD_AMOUNT || "100");

function pluralRubles(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "рубль";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "рубля";
  return "рублей";
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
  const [cardFlow, setCardFlow] = useState(false);
  const [cardCopied, setCardCopied] = useState(false);
  const [cardPaid, setCardPaid] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);

  useEffect(() => {
    api.subscription.prices().then(setPrices).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCardFlow(false);
      setCardCopied(false);
      setCardPaid(false);
      setCardSubmitting(false);
    }
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
    setCardSubmitting(true);
    try {
      await api.subscription.reportCardTransfer({ amount: CARD_AMOUNT });
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
  }, [onSuccess, onClose]);

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

            {!cardFlow ? (
              <div className="flex flex-col gap-3">
                {prices?.isStars && (
                  <motion.button
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStarsPurchase}
                    disabled={loading === "analysis_1"}
                    style={{
                      width: "100%", padding: "18px", borderRadius: 18,
                      border: "2px solid #FFD700", background: "rgba(255, 215, 0, 0.08)",
                      textAlign: "left", cursor: loading === "analysis_1" ? "wait" : "pointer",
                      opacity: loading === "analysis_1" ? 0.7 : 1, position: "relative",
                    }}
                  >
                    <span style={{ position: "absolute", top: -8, right: 16, fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: "#FFD700", color: "white" }}>
                      Telegram Stars
                    </span>
                    <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>1 анализ</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Разовый анализ кожи</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{formatPrice(prices?.analysis ?? 1)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>⭐</div>
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
                )}

                {CARD_NUMBER && (
                  <motion.button
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setCardFlow(true)}
                    style={{
                      width: "100%", padding: "18px", borderRadius: 18,
                      border: "2px solid #4CAF50", background: "rgba(76, 175, 80, 0.06)",
                      textAlign: "left", cursor: "pointer", position: "relative",
                    }}
                  >
                    <span style={{ position: "absolute", top: -8, right: 16, fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: "#4CAF50", color: "white" }}>
                      Перевод на карту
                    </span>
                    <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>1 анализ</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Оплата переводом на карту {CARD_BANK}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{CARD_AMOUNT}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>₽</div>
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
                )}

                {[
                  { id: "analysis_5", title: "5 анализов", subtitle: "Для регулярного ухода", price: "400₽", desc: "5 анализов кожи, детальный разбор, персональная рутина", badge: "Скоро", color: "#FFB4A2", bgColor: "rgba(255, 180, 162, 0.1)" },
                  { id: "subscription", title: "PRO подписка", subtitle: "Полный уход на месяц", price: "500₽/мес", desc: "Безлимит анализов, еженедельный отчёт, приоритетная поддержка", badge: "Скоро", color: "#A8D8EA", bgColor: "rgba(168, 216, 234, 0.1)" },
                ].map((opt, i) => (
                  <motion.button
                    key={opt.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (i + 1) * 0.08 }}
                    style={{
                      width: "100%", padding: "18px", borderRadius: 18,
                      border: "2px solid var(--border)", background: opt.bgColor,
                      textAlign: "left", cursor: "not-allowed", opacity: 0.6, position: "relative",
                    }}
                    disabled
                  >
                    <span style={{ position: "absolute", top: -8, right: 16, fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: opt.color, color: "white" }}>
                      {opt.badge}
                    </span>
                    <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{opt.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{opt.subtitle}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-muted)" }}>{opt.price}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      {opt.desc}
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
              >
                {cardPaid ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Заявка принята!</div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
                      Анализы будут зачислены после проверки платежа (обычно в течение часа).
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setCardFlow(false)}
                      style={{ alignSelf: "flex-start", fontSize: 13, color: "var(--primary-dark)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "4px 0" }}
                    >
                      ← Назад
                    </button>

                    <div style={{
                      padding: "20px 16px", borderRadius: 16,
                      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                      color: "white",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                        {CARD_BANK}
                      </div>
                      <div style={{
                        fontSize: 22, fontWeight: 700, letterSpacing: 2,
                        fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
                        marginBottom: 16, wordBreak: "break-all",
                      }}>
                        {CARD_NUMBER.replace(/(\d{4})(?=\d)/g, "$1 ")}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
                        <span>Сумма к оплате</span>
                        <span style={{ fontWeight: 700, opacity: 1, color: "#4CAF50" }}>{CARD_AMOUNT} {pluralRubles(CARD_AMOUNT)}</span>
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={copyCardNumber}
                        style={{
                          width: "100%", padding: "10px", borderRadius: 12,
                          background: cardCopied ? "#4CAF50" : "rgba(255,255,255,0.12)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          color: "white", fontSize: 13, fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {cardCopied ? "Номер скопирован!" : "Скопировать номер карты"}
                      </motion.button>
                    </div>

                    <div style={{
                      padding: "14px 16px", borderRadius: 14,
                      background: "var(--bg)", fontSize: 12,
                      color: "var(--text-secondary)", lineHeight: 1.6,
                    }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>📋 Инструкция</div>
                      <ol style={{ paddingLeft: 18, margin: 0 }}>
                        <li style={{ marginBottom: 4 }}>Скопируйте номер карты и переведите <strong>{CARD_AMOUNT} {pluralRubles(CARD_AMOUNT)}</strong></li>
                        <li style={{ marginBottom: 4 }}>В комментарии к переводу укажите: <strong>Reveli анализ</strong></li>
                        <li style={{ marginBottom: 4 }}>Нажмите «Я оплатил(а)» ниже</li>
                        <li>Анализы зачислятся после проверки (обычно в течение часа)</li>
                      </ol>
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleCardPaid}
                      disabled={cardSubmitting}
                      style={{
                        width: "100%", padding: "16px", borderRadius: 16,
                        background: cardSubmitting ? "var(--border)" : "linear-gradient(135deg, #4CAF50, #2E7D32)",
                        color: "white", fontSize: 15, fontWeight: 600, border: "none",
                        cursor: cardSubmitting ? "default" : "pointer",
                      }}
                    >
                      {cardSubmitting ? "Отправляем..." : "Я оплатил(а)"}
                    </motion.button>

                    <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                      Если возникнут вопросы — напишите в поддержку
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
