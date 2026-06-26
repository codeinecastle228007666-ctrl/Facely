"use client";

import React, { useEffect, useState, useCallback } from "react";
import { adminApi, type DashCounts } from "./adminApi";

interface Props {
  refreshKey: number;
}

/**
 * Top-of-page dashboard panel — six stat cards derived from a single
 * server round-trip (Promise.all in adminService.dashStats). Refreshes
 * when `refreshKey` changes (admin grant, claim confirm/cancel, etc.).
 *
 * The pendingClaims tile doubles as a banner notice when > 0.
 */
export const DashStats: React.FC<Props> = ({ refreshKey }) => {
  const [stats, setStats] = useState<DashCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await adminApi.dashStats());
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run, refreshKey]);

  if (loading && !stats) {
    return (
      <section
        style={{
          marginBottom: 16,
          padding: 12,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        Загрузка статистики…
      </section>
    );
  }
  if (error && !stats) {
    return (
      <section
        style={{
          marginBottom: 16,
          padding: 12,
          fontSize: 12,
          color: "#c06575",
        }}
      >
        ⚠ {error}
      </section>
    );
  }

  const s = stats!;
  const tile = (label: string, value: number, accent?: boolean) => (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: accent ? "rgba(232, 160, 180, 0.10)" : "var(--bg)",
        border: `1px solid ${
          accent ? "var(--primary-light)" : "var(--border)"
        }`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
        {value.toLocaleString("ru-RU")}
      </div>
    </div>
  );

  return (
    <section id="dashboard" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
          📊 Статистика
        </h2>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "white",
            fontSize: 11,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? "default" : "pointer",
          }}
        >
          ↻ обновить
        </button>
      </div>
      {s.pendingClaims > 0 && (
        <a
          href="#claims"
          style={{
            display: "block",
            marginBottom: 8,
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(238, 200, 80, 0.18)",
            border: "1px solid #d8b34b",
            color: "#7a5800",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          ⏳ {s.pendingClaims} новых заявок на оплату — перейти к обработке
        </a>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {tile("Юзеров всего", s.totalUsers)}
        {tile("Платящих", s.payingUsers)}
        {tile(
          "Заявок ожидает",
          s.pendingClaims,
          s.pendingClaims > 0,
        )}
        {tile("Заявок закрыто", s.confirmedClaims)}
        {tile("Stars-платежей", s.starsInvoices)}
        {tile("Начислений / 7д", s.grantsLast7d)}
      </div>
    </section>
  );
};
