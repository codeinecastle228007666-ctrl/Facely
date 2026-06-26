"use client";

import React, { useEffect, useState } from "react";
import { adminApi, type AdminGrantRow } from "./adminApi";

const KIND_LABEL: Record<string, string> = {
  paidAnalyses: "Платных анализов",
  freeChatQuestions: "Вопросов чата",
  streakFreeze: "Streak freezes",
  subscriptionDays: "Дней подписки",
  proTrialDays: "Дней Pro-trial",
  xp: "XP",
};

interface Props {
  refreshKey: number;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Audit log feed — most-recent N grants globally. Refreshes on
 * `refreshKey` change (i.e. after each successful grant in the
 * selected-user panel). Single-admin MVP keeps this short list;
 * for an audit-heavy workflow we could add export-to-CSV.
 */
export const RecentGrants: React.FC<Props> = ({ refreshKey }) => {
  const [grants, setGrants] = useState<AdminGrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .listGrants({ limit: 30 })
      .then((rows) => {
        if (!cancelled) setGrants(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Не удалось загрузить");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
          📜 Последние начисления
        </h2>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {loading ? "…" : `${grants.length} шт`}
        </span>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Загрузка…
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 16, fontSize: 12, color: "#c06575" }}>
            {error}
          </div>
        )}
        {!loading && !error && grants.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Пока пусто.
          </div>
        )}
        {!loading &&
          !error &&
          grants.map((g) => (
            <div
              key={g.id}
              style={{
                padding: "10px 14px",
                borderTop: "1px solid var(--border)",
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  +{g.amount}{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {KIND_LABEL[g.kind] ?? g.kind}
                  </span>
                </span>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "monospace",
                    fontSize: 11,
                  }}
                >
                  {fmtTime(g.createdAt)}
                </span>
              </div>
              <div
                style={{ marginTop: 4, color: "var(--text-muted)" }}
              >
                → {g.target.name || "(без имени)"}
                {g.target.username && (
                  <span> @{g.target.username}</span>
                )}{" "}
                <span style={{ fontFamily: "monospace" }}>
                  ({g.target.telegramId})
                </span>
              </div>
              {g.reason && (
                <div
                  style={{
                    marginTop: 4,
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                  }}
                >
                  «{g.reason}»
                </div>
              )}
            </div>
          ))}
      </div>
    </section>
  );
};
