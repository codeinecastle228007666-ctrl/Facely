"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ paddingTop: 8, paddingBottom: 40 }}
    >
      <button
        onClick={() => router.back()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          color: "var(--primary-dark)",
          background: "none",
          border: "none",
          padding: "8px 0",
          marginBottom: 16,
          cursor: "pointer",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M19 12H5m0 0l6-6m-6 6l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Назад
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Политика конфиденциальности</h1>

      <div className="card flex flex-col gap-3" style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
        <p><strong style={{ color: "var(--text)" }}>1. Какие данные мы собираем</strong><br/>
        Facely обрабатывает только те данные, которые вы добровольно предоставляете: фотографию лица для анализа кожи и имя пользователя Telegram. Мы не собираем контакты, геолокацию, историю переписки или любые другие личные данные.</p>

        <p><strong style={{ color: "var(--text)" }}>2. Как используются фотографии</strong><br/>
        Фото отправляется напрямую на сервер Face++ (Rekognition) для анализа кожи. После получения результата оригинальное изображение может храниться на сервере для отображения в истории анализов. Вы можете удалить фото, очистив историю.</p>

        <p><strong style={{ color: "var(--text)" }}>3. Передача данных третьим лицам</strong><br/>
        Мы не продаём и не передаём ваши данные третьим лицам. Для работы сервиса используются: Supabase (база данных), Face++ (анализ кожи), Groq AI (чат-консультации), Telegram (платежи Stars). Каждый из этих сервисов соблюдает собственную политику конфиденциальности.</p>

        <p><strong style={{ color: "var(--text)" }}>4. Хранение данных</strong><br/>
        Ваши данные хранятся на серверах Supabase и Vercel. Вы можете запросить удаление аккаунта и всех связанных данных, написав в поддержку.</p>

        <p><strong style={{ color: "var(--text)" }}>5. Telegram Stars</strong><br/>
        Платежи обрабатываются через Telegram Stars. Facely не получает и не хранит платёжные данные.</p>

        <p><strong style={{ color: "var(--text)" }}>6. Контакты</strong><br/>
        По вопросам конфиденциальности: <span style={{ color: "var(--primary-dark)" }}>codeinecastle228007666@mail.ru</span></p>

        <p style={{ fontSize: 11, marginTop: 8 }}>Последнее обновление: июнь 2026</p>
      </div>
    </motion.div>
  );
}
