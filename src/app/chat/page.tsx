"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { useUser } from "@/hooks/useUser";
import { api, type ChatMessageResult } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";

interface ParsedStep {
  productName: string;
  timeOfDay: "morning" | "evening";
  stepOrder: number;
}

function parseRoutineFromText(text: string): ParsedStep[] | null {
  const morningMatch = text.match(/☀️?\s*УТРО[:\s]*\n?([\s\S]*?)(?=🌙|$)/i);
  const eveningMatch = text.match(/🌙?\s*ВЕЧЕР[:\s]*\n?([\s\S]*)/i);

  if (!morningMatch && !eveningMatch) return null;

  const steps: ParsedStep[] = [];

  const parseBlock = (block: string, timeOfDay: "morning" | "evening") => {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    let order = 0;
    for (const line of lines) {
      const cleaned = line.replace(/^\s*(\d+[\.\)\s]+|[•\-\*]\s*)/, "").trim();
      if (!cleaned || cleaned.length < 2) continue;
      const isHeader = /^(утро|вечер|день|morning|evening)/i.test(cleaned);
      if (isHeader) continue;
      steps.push({ productName: cleaned, timeOfDay, stepOrder: order++ });
    }
  };

  if (morningMatch?.[1]) parseBlock(morningMatch[1], "morning");
  if (eveningMatch?.[1]) parseBlock(eveningMatch[1], "evening");

  return steps.length > 0 ? steps : null;
}

const QUICK_PROMPTS = [
  { emoji: "🗓️", label: "Составь мне рутину", prompt: "Составь мне персональную рутину ухода на утро и вечер, учитывая мой тип кожи и проблемы" },
  { emoji: "🧴", label: "Какие средства добавить?", prompt: "Какие средства по уходу мне стоит добавить в инвентарь? Проанализируй, чего не хватает в моей текущей рутине" },
  { emoji: "🔍", label: "Разбор состава", prompt: "На какие ингредиенты в косметике мне нужно обращать внимание, а каких избегать, учитывая мой тип кожи?" },
  { emoji: "✨", label: "Как улучшить кожу?", prompt: "Что я могу сделать, чтобы улучшить состояние кожи? Дай комплексные рекомендации" },
];

export default function ChatPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessageResult[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [savedRoutines, setSavedRoutines] = useState<Set<string>>(new Set());
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    if (saveToast) { const t = setTimeout(() => setSaveToast(null), 3000); return () => clearTimeout(t); }
  }, [saveToast]);

  useEffect(() => {
    api.chat.getMessages().then(setMessages).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasSubscription = user?.subscription?.status === "active";
  const canSend = hasSubscription || (remaining ?? user?.freeChatQuestions ?? 3) > 0;
  const displayRemaining = remaining ?? user?.freeChatQuestions ?? 3;

  const sendMessage = useCallback(async (content: string) => {
    if (sending || !canSend) return;
    setSending(true);
    try {
      const res = await api.chat.sendMessage({ content });
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "user", content, createdAt: new Date().toISOString() },
        { id: (Date.now() + 1).toString(), role: "assistant", content: res.response, createdAt: new Date().toISOString() },
      ]);
      setRemaining(res.remaining);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "no_chat_questions_left") {
        setRemaining(0);
        alert("Бесплатные вопросы закончились. Купите пакет вопросов за 10 ⭐.");
      }
    } finally {
      setSending(false);
    }
  }, [sending, canSend]);

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    sendMessage(msg);
  }, [input, sendMessage]);

  const sendQuickPrompt = useCallback((prompt: string) => {
    sendMessage(prompt);
  }, [sendMessage]);

  const handleSaveRoutine = useCallback(async (msgId: string, content: string) => {
    const steps = parseRoutineFromText(content);
    if (!steps) return;
    try {
      const existing = await api.routine.get();
      if (existing && existing.steps.length > 0) {
        const ok = window.confirm("У вас уже настроена рутина. Заменить её на новую из ответа AI?");
        if (!ok) return;
      }
      await api.routine.save({
        steps: steps.map((s) => ({
          productName: s.productName,
          timeOfDay: s.timeOfDay,
          stepOrder: s.stepOrder,
        })),
      });
      setSavedRoutines((prev) => new Set(prev).add(msgId));
      setSaveToast("Рутина сохранена! Смотрите на главной в разделе «Рутина ухода»");
    } catch {
      setSaveToast("Не удалось сохранить рутину");
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 100px)", paddingTop: 8 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", marginBottom: 12 }}>
        {hasSubscription ? "Безлимитный чат" : `Осталось вопросов: ${displayRemaining}`}
      </div>

      {!hasSubscription && displayRemaining <= 0 && (
        <motion.button
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={async () => {
            const tg = (window as any).Telegram?.WebApp;
            if (!tg) { alert("Доступно только в Telegram"); return; }
            try {
              const { url } = await api.subscription.createChatStarsInvoice();
              tg.openInvoice(url, (status: string) => {
                if (status === "paid") {
                  alert("Оплата прошла! Вопросы будут зачислены в течение минуты.");
                  setTimeout(() => window.location.reload(), 1500);
                }
              });
            } catch { alert("Ошибка оплаты"); }
          }}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: 14,
            background: "linear-gradient(135deg, #FFD700, #FFC107)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          Купить 10 вопросов за 10 ⭐
        </motion.button>
      )}

      {saveToast && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",          top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 400,
            padding: "10px 20px", borderRadius: 14,
            background: "var(--text)", color: "white",
            fontSize: 12, fontWeight: 600, textAlign: "center",
            maxWidth: 320, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
          onClick={() => setSaveToast(null)}
        >
          {saveToast}
        </motion.div>
      )}

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 20px 20px", color: "var(--text-secondary)", fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            Задайте вопрос косметологу о вашей коже
          </div>
        )}

        {messages.length === 0 && canSend && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              justifyContent: "center",
              padding: "0 8px 12px",
            }}
          >
            {QUICK_PROMPTS.map((qp, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * i }}
                whileTap={{ scale: 0.95 }}
                onClick={() => sendQuickPrompt(qp.prompt)}
                disabled={sending}
                style={{
                  padding: "10px 14px",
                  borderRadius: 20,
                  border: "1px solid var(--border)",
                  background: sending ? "var(--bg)" : "var(--bg-card)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  cursor: sending ? "default" : "pointer",
                  opacity: sending ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 15 }}>{qp.emoji}</span>
                {qp.label}
              </motion.button>
            ))}
          </motion.div>
        )}
        <AnimatePresence>
          {messages.map((msg) => {
            const routine = msg.role === "assistant" ? parseRoutineFromText(msg.content) : null;
            const alreadySaved = savedRoutines.has(msg.id);
            return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
              }}
            >
              <div style={{
                padding: "12px 16px",
                borderRadius: 18,
                background: msg.role === "user" ? "var(--primary)" : "var(--bg-card)",
                color: msg.role === "user" ? "white" : "var(--text)",
                fontSize: 14,
                lineHeight: 1.5,
                boxShadow: "var(--shadow)",
                borderBottomRightRadius: msg.role === "user" ? 4 : 18,
                borderBottomLeftRadius: msg.role === "user" ? 18 : 4,
                whiteSpace: "pre-wrap",
              }}>
                {msg.content}
              </div>
              {routine && (
                <motion.button
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSaveRoutine(msg.id, msg.content)}
                  disabled={alreadySaved}
                  style={{
                    marginTop: 6,
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: alreadySaved ? "1px solid #A8D8EA" : "1px solid var(--border)",
                    background: alreadySaved ? "rgba(168, 216, 234, 0.12)" : "var(--bg-card)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: alreadySaved ? "#7EC4D8" : "var(--primary-dark)",
                    cursor: alreadySaved ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    alignSelf: "flex-start",
                  }}
                >
                  {alreadySaved ? "✅" : "💾"}
                  {alreadySaved ? "Сохранено в рутину" : "Сохранить в рутину"}
                </motion.button>
              )}
            </motion.div>
          )})}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 8, padding: "8px 0", background: "var(--bg)", borderRadius: 20 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Напишите вопрос..."
          disabled={!canSend}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 14,
            background: "var(--bg-card)",
            fontSize: 14,
            border: "1px solid var(--border)",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend || !input.trim() || sending}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: canSend ? "var(--primary)" : "var(--border)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            border: "none",
            cursor: canSend ? "pointer" : "default",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <TabBar />
    </div>
  );
}
