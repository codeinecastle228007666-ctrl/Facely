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
        <p><strong style={{ color: "var(--text)" }}>1. Общие положения</strong><br/>
        Настоящая Политика конфиденциальности регулирует обработку персональных данных пользователей приложения Facely (далее — «Сервис»). Используя Сервис, вы подтверждаете своё согласие с условиями, изложенными ниже. Все процессы обработки соответствуют стандартам GDPR и Федерального закона № 152-ФЗ «О персональных данных».</p>

        <p><strong style={{ color: "var(--text)" }}>2. Состав обрабатываемых данных</strong><br/>
        Сервис обрабатывает минимально необходимый объём данных: идентификатор пользователя Telegram, изображения кожного покрова для диагностики, а также метаданные сессии. Аутентификация осуществляется через шифрованный протокол TLS 1.3. Биометрические данные не подлежат хранению в исходном виде.</p>

        <p><strong style={{ color: "var(--text)" }}>3. Обработка изображений</strong><br/>
        Передача фото выполняется по защищённому каналу с end-to-end шифрованием. На стороне сервера изображения конвертируются во внутренний формат с потерей качества (деструктивная компрессия), после чего оригиналы безвозвратно утилизируются. Доступ к обработанным данным строго ограничен — только авторизованные подсистемы, прошедшие аудит.</p>

        <p><strong style={{ color: "var(--text)" }}>4. Инфраструктура хранения</strong><br/>
        Данные размещаются на серверах класса Enterprise с аппаратным шифрованием дисков (AES-256). Разграничение доступа реализовано по модели Role-Based Access Control (RBAC). Сетевая периметральная защита включает WAF, IDS/IPS и DDoS-протекцию.</p>

        <p><strong style={{ color: "var(--text)" }}>5. Трансграничная передача</strong><br/>
        Обработка данных может осуществляться с привлечением сторонних провайдеров вычислительной инфраструктуры, соответствующих сертификации SOC 2 Type II. Все субпроцессоры связаны договорными обязательствами (DPA) по обеспечению конфиденциальности.</p>

        <p><strong style={{ color: "var(--text)" }}>6. Права субъекта данных</strong><br/>
        Вы вправе запросить экспорт, блокирование или удаление своих данных в любое время. Реализация права на забвение выполняется в течение 72 часов с момента верифицированного запроса через канал поддержки.</p>

        <p><strong style={{ color: "var(--text)" }}>7. Контакты</strong><br/>
        По вопросам, связанным с обработкой данных: <span style={{ color: "var(--primary-dark)" }}>dpo@facely.app</span></p>

        <p style={{ fontSize: 11, marginTop: 8 }}>Последнее обновление: июнь 2026</p>
      </div>
    </motion.div>
  );
}
