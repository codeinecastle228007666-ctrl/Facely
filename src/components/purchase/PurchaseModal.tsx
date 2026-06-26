"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";
import {
  TIERS_META,
  PRICES,
  bulkSavingsCopy,
  formatAmount,
  pricePerAnalysis,
  type TierId,
  type Currency,
} from "@/lib/pricing";

type Tier = TierId;

interface TierView {
  id: Tier;
  icon: string;
  title: string;
  desc: string;
  badge?: string;
  savings?: string;
  amount: number;
  perAnalysisLabel: string;
  amountLabel: string;
}

// CARD_NUMBER остаётся в env — это чувствительные данные (номер карты).
// Передаётся в JS-бандл как NEXT_PUBLIC, поэтому допустим только
// fallback-режим при отсутствии PROVIDER_TOKEN (см. @/lib/pricing).
const CARD_NUMBER = process.env.NEXT_PUBLIC_CARD_NUMBER || "";
const CARD_BANK = process.env.NEXT_PUBLIC_CARD_BANK || "Сбербанк";
const CARD_HOLDER = process.env.NEXT_PUBLIC_CARD_HOLDER || "";

interface PurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface PreviewState {
  ref: string;
  tier: Tier;
  amount: number;
  loading: boolean;
  error: string | null;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState<Tier | null>(null);
  const [prices, setPrices] = useState<{
    analysis: number;
    pack5: number;
    monthly: number;
    chat: number;
    currency: Currency;
    isStars: boolean;
  } | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [cardCopied, setCardCopied] = useState(false);
  const [cardPaid, setCardPaid] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);

  // 2026-06-26 Phase 1.5 — ref генерируется на КЛИК «Картой», а не после
  // «Я оплатил(a)». Юзер видит реф ДО перевода — может вписать его в
  // комментарий к банковскому платежу. previewState привязан к
  // выбранному тиру и обновляется useEffect'ом при смене тира.
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [refCopied, setRefCopied] = useState(false);

  // Phase 1 поля (оставлены для обратной совместимости / опционального UX).
  const [submittedReference, setSubmittedReference] = useState("");
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [generatedReference, setGeneratedReference] = useState<string | null>(null);

  // Live @username **больше** не читается из Telegram WebApp:
  // подставлять Telegram-@username в UI «банковского комментария» —
  // это data-leak в screenshot юзера и в /admin нотификации. Юзер
  // сам впишет свой `@username` в комментарий при переводе.

  useEffect(() => {
    api.subscription
      .prices()
      .then((p) =>
        setPrices({
          analysis: p.analysis,
          pack5: p.pack5,
          monthly: p.monthly,
          chat: p.chat,
          currency: p.currency as Currency,
          isStars: p.isStars,
        }),
      )
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedTier(null);
      setCardCopied(false);
      setCardPaid(false);
      setCardSubmitting(false);
      setLoading(null);
      setPreviewState(null);
      setRefCopied(false);
      setSubmittedReference("");
      setScreenshotBase64(null);
      setScreenshotError(null);
      setGeneratedReference(null);
    }
  }, [open]);

  // Phase 1.5 — когда юзер выбирает «Картой» на конкретном тире,
  // асинхронно запрашиваем у сервера реф (idempotent: при повторном
  // открытии того же тира вернётся тот же реф; при смене тира создаётся
  // новый драфт под новый тир).
  useEffect(() => {
    setPreviewState(null);
    setRefCopied(false);
    if (selectedTier === null) return;

    let cancelled = false;
    setPreviewState({ ref: "", tier: selectedTier, amount: 0, loading: true, error: null });

    (async () => {
      try {
        const result = await api.subscription.previewCardTransfer({ tier: selectedTier });
        if (cancelled) return;
        setPreviewState({
          ref: result.expectedReference,
          tier: selectedTier,
          amount: result.amount,
          loading: false,
          error: null,
        });
      } catch (e: any) {
        if (cancelled) return;
        setPreviewState({
          ref: "",
          tier: selectedTier,
          amount: 0,
          loading: false,
          error: e?.message ?? "Не удалось сгенерировать код оплаты",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTier]);

  const copyCardNumber = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CARD_NUMBER);
      setCardCopied(true);
      setTimeout(() => setCardCopied(false), 3000);
    } catch {
      prompt("Номер карты:", CARD_NUMBER);
    }
  }, []);

  const copyReference = useCallback(async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 3000);
    } catch {
      prompt("Код оплаты:", ref);
    }
  }, []);

  const handleCardPaid = useCallback(async () => {
    if (!selectedTier) return;
    setCardSubmitting(true);
    try {
      const result = await api.subscription.reportCardTransfer({
        tier: selectedTier,
        expectedReference: previewState?.ref || undefined,
        submittedReference: submittedReference.trim() || undefined,
        screenshotBase64: screenshotBase64 || undefined,
      });
      if (result.success) {
        setGeneratedReference(result.expectedReference ?? previewState?.ref ?? null);
        setCardPaid(true);
        // 2026-06-26 — extend to 6s so user has time to read confirmation + ref.
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 6000);
      } else {
        alert(`Не удалось обработать заявку: ${result.error}. Попробуйте ещё раз.`);
      }
    } catch {
      alert("Не удалось отправить уведомление. Пожалуйста, напишите в поддержку или попробуйте позже.");
    } finally {
      setCardSubmitting(false);
    }
  }, [selectedTier, submittedReference, screenshotBase64, previewState, onSuccess, onClose]);

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

  const currency: Currency = prices?.currency ?? "XTR";
  const canUseStars = !!prices?.isStars;

  const tierViews: TierView[] = TIERS_META.map((m) => {
    const amount = PRICES[currency][m.id];
    return {
      id: m.id,
      icon: m.icon,
      title: m.title,
      desc: m.description,
      badge: m.badge,
      savings: bulkSavingsCopy(m.id) ?? undefined,
      amount,
      perAnalysisLabel: pricePerAnalysis(currency, m.id),
      amountLabel: formatAmount(amount, currency),
    };
  });

  const selectedTierDef = selectedTier
    ? tierViews.find((t) => t.id === selectedTier)
    : undefined;

  // Phase 1.5 — для текста инструкции: ref из preview. Юзернейм
  // **никогда** не подставляется автоматически — это data-leak в
  // UI/bank-screenshot. Юзер должен вписать его сам в банковский
  // комментарий, поэтому здесь всегда placeholder.
  const refToShowInInstructions = previewState?.ref;
  const usernameHint = "ваше имя";

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
                  {tierViews.map((tier, i) => {
                    const isPopular = tier.id === "pack5";
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
                            {tier.amountLabel}
                          </div>
                          {tier.perAnalysisLabel !== tier.amountLabel && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {tier.perAnalysisLabel}
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
                                : `⭐ ${tier.amount}`}
                            </motion.button>
                          )}
                          {(currency === "RUB" || CARD_NUMBER) && (
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
                  Админ проверит перевод в течение часа и зачислит {selectedTierDef?.title}.<br />
                  Мы пришлём вам уведомление в Telegram после подтверждения.
                </div>
                {(generatedReference || previewState?.ref) && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "var(--bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--primary-dark)",
                        letterSpacing: 1,
                      }}
                    >
                      № {generatedReference ?? previewState?.ref}
                    </span>
                    <button
                      onClick={() => copyReference(generatedReference ?? previewState?.ref ?? "")}
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: refCopied ? "#4CAF50" : "transparent",
                        color: refCopied ? "white" : "var(--text-secondary)",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {refCopied ? "✓ Скопировано" : "Копировать"}
                    </button>
                  </div>
                )}
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
                      {selectedTierDef && formatAmount(PRICES.RUB[selectedTierDef.id], "RUB")}
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

                {/* Phase 1.5 — ULTRA-VISIBLE ref card BEFORE submit.
                    Юзер копирует этот код и вписывает в комментарий к
                    банковскому переводу — без этого админ не найдёт платёж. */}
                <div
                  style={{
                    padding: "16px 14px",
                    borderRadius: 14,
                    background: "linear-gradient(135deg, rgba(255,215,0,0.10) 0%, rgba(126,196,216,0.10) 100%)",
                    border: "2px dashed #FFD700",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#8A6A00",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    🔖 Ваш код оплаты
                  </div>
                  {previewState?.loading || !previewState ? (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Генерируем код…
                    </div>
                  ) : previewState.error ? (
                    <div style={{ fontSize: 12, color: "#D32F2F" }}>
                      Не удалось получить код. Попробуйте вернуться назад и обновить.
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
                            fontSize: 18,
                            fontWeight: 700,
                            color: "#8A6A00",
                            letterSpacing: 1.5,
                          }}
                        >
                          {previewState.ref}
                        </span>
                        <button
                          onClick={() => copyReference(previewState.ref)}
                          style={{
                            fontSize: 11,
                            padding: "6px 12px",
                            borderRadius: 10,
                            border: "1px solid #FFD700",
                            background: refCopied ? "#4CAF50" : "rgba(255,215,0,0.15)",
                            color: refCopied ? "white" : "#8A6A00",
                            cursor: "pointer",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {refCopied ? "✓ Скопировано" : "Копировать"}
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          marginTop: 8,
                          lineHeight: 1.4,
                        }}
                      >
                        Впишите этот код в комментарий к переводу — иначе админ не сможет найти ваш платёж.
                      </div>
                    </>
                  )}
                </div>

                {/* Phase 1.5 — инструкция переписана: чёткие 2 строки в
                    комментарии банка, сильный warning админ-не-найдёт. */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "var(--bg)",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>
                    📋 Инструкция по переводу
                  </div>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    <li>
                      Переведите{" "}
                      <strong>
                        {selectedTierDef &&
                          formatAmount(PRICES.RUB[selectedTierDef.id], "RUB")}
                      </strong>{" "}
                      на карту {CARD_BANK}
                      {CARD_HOLDER ? ` (${CARD_HOLDER})` : ""}
                    </li>
                    <li>
                      <strong style={{ color: "#D32F2F" }}>В комментарии ОБЯЗАТЕЛЬНО</strong>{" "}
                      укажите две строки:
                      <div
                        style={{
                          marginTop: 6,
                          marginBottom: 4,
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "white",
                          border: "1px solid var(--border)",
                          fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
                          fontSize: 12,
                        }}
                      >                        <div>{refToShowInInstructions ? refToShowInInstructions : "R-КККК-ЧЧЧЧ"}</div>
                        <div>{usernameHint}</div>
                      </div>
                      <span style={{ fontSize: 11 }}>
                        Код сверху — чтобы админ нашёл платёж. Ваш @username / имя —
                        чтобы админ знал кому зачислить.
                      </span>
                    </li>
                    <li>
                      Нажмите «Я оплатил(а)» — мы пришлём подтверждение, и админ зачислит в течение часа
                    </li>
                  </ol>
                </div>

                {/* Phase 1 — optional submittedReference field. User types any
                    word they put in their bank comment for admin cross-check. */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    💬 Слово для сверки (опционально)
                  </label>
                  <input
                    type="text"
                    value={submittedReference}
                    onChange={(e) => setSubmittedReference(e.target.value)}
                    maxLength={64}
                    placeholder="например: привет2026"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      background: "white",
                      color: "var(--text)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    Если добавите это же слово в комментарий к переводу, админ найдёт платёж быстрее
                  </div>
                </div>

                {/* Phase 1 — optional screenshot upload, max 1MB enforced client-side. */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    📸 Скриншот из банка (опционально, до 1 MB)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 1_000_000) {
                        setScreenshotError("Файл больше 1 MB. Сожмите скриншот.");
                        return;
                      }
                      setScreenshotError(null);
                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = reader.result;
                        if (typeof result === "string") {
                          setScreenshotBase64(result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      width: "100%",
                    }}
                  />
                  {screenshotError && (
                    <div style={{ fontSize: 11, color: "#D32F2F", marginTop: 4 }}>{screenshotError}</div>
                  )}
                  {screenshotBase64 && (
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "#4CAF50",
                      }}
                    >
                      ✓ Скриншот прикреплён
                      <button
                        onClick={() => setScreenshotBase64(null)}
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        Убрать
                      </button>
                    </div>
                  )}
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCardPaid}
                  disabled={cardSubmitting || previewState?.loading || !previewState?.ref}
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
                    opacity: cardSubmitting ? 0.7 : 1,
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
