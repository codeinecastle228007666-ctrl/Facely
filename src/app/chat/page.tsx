"use client";

import React, { useState, useEffect, useRef } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { useUser } from "@/hooks/useUser";
import { api, type ChatMessageResult } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessageResult[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState(user?.freeChatQuestions ?? 3);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.chat.getMessages().then(setMessages).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const userMsg = input.trim();
    setInput("");
    try {
      const res = await api.chat.sendMessage({ content: userMsg });
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "user", content: userMsg, createdAt: new Date().toISOString() },
        { id: (Date.now() + 1).toString(), role: "assistant", content: res.response, createdAt: new Date().toISOString() },
      ]);
      setRemaining(res.remaining);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "no_chat_questions_left") {
        alert("Закончились бесплатные вопросы. Оформите подписку для безлимитного чата.");
      }
    } finally {
      setSending(false);
    }
  };

  const hasSubscription = user?.subscription?.status === "active";
  const canSend = hasSubscription || remaining > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 100px)", paddingTop: 8 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", marginBottom: 12 }}>
        {hasSubscription ? "Безлимитный чат" : `Осталось вопросов: ${remaining}`}
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)", fontSize: 14 }}>
            Задайте вопрос косметологу о вашей коже
          </div>
        )}
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                padding: "12px 16px",
                borderRadius: 18,
                background: msg.role === "user" ? "var(--primary)" : "var(--bg-card)",
                color: msg.role === "user" ? "white" : "var(--text)",
                fontSize: 14,
                lineHeight: 1.5,
                boxShadow: "var(--shadow)",
                borderBottomRightRadius: msg.role === "user" ? 4 : 18,
                borderBottomLeftRadius: msg.role === "user" ? 18 : 4,
              }}
            >
              {msg.content}
            </motion.div>
          ))}
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
