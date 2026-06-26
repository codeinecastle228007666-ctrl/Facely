"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  adminApi,
  type ProcessedInvoiceRow,
  type UserSummary,
} from "./adminApi";

interface Props {
  refreshKey: number;
  /** User-id → summary map for resolving display names without an
   * extra query per row. Optional. */
  userIndex?: Record<string, UserSummary>;
  onUserPicked?: (user: { id: string; telegramId: string; name: string | null; username: string | null }) => void;
}

const PAGE_SIZE = 20;

const KIND_LABEL: Record<string, string> = {
  analysis: "Анализы",
  chat: "Чат",
  subscription: "Подписка",
};

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
 * Read-only feed of Telegram Stars auto-credits. Driven by
 * ProcessedInvoice (idempotency dedupe table from webhook). Each row
 * shows kind (analysis/chat/subscription), amount + currency,
 * processedAt, and a clickable userId (resolved via userIndex when
 * available, else raw id with admin-db-lookup hint).
 */
export const StarsInvoicesFeed: React.FC<Props> = ({
  refreshKey,
  userIndex,
  onUserPicked,
}) => {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ProcessedInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await adminApi.listProcessedInvoices({
          offset: p * PAGE_SIZE,
          limit: PAGE_SIZE,
        }),
      );
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run(page);
  }, [page, run]);

  useEffect(() => {
    setPage(0);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id="stars" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
        ⭐ Автооплаты (Telegram Stars)
      </h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>
            Загрузка…
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 16, fontSize: 12, color: "#c06575" }}>
            {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Нет записей.
          </div>
        )}
        {!loading &&
          !error &&
          rows.map((p) => {
            const u = userIndex?.[p.userId];
            const userLabel = u?.name || (u ? "(без имени)" : null);
            return (
              <div
                key={p.id}
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
                    {KIND_LABEL[p.kind] ?? p.kind}
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontWeight: 400,
                      }}
                    >
                      {" · "}
                      {p.amount} {p.currency === "XTR" ? "⭐" : p.currency}
                    </span>
                  </span>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    {fmtTime(p.processedAt)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "var(--text-muted)",
                  }}
                >
                  →{" "}
                  {userLabel ? (
                    onUserPicked ? (
                      <button
                        type="button"
                        onClick={() =>
                          onUserPicked({
                            id: p.userId,
                            telegramId: u?.telegramId ?? "",
                            name: u?.name ?? null,
                            username: u?.username ?? null,
                          })
                        }
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--primary-dark)",
                          cursor: "pointer",
                          textDecoration: "underline",
                          font: "inherit",
                        }}
                      >
                        {userLabel}
                      </button>
                    ) : (
                      userLabel
                    )
                  ) : (
                    <span
                      style={{
                        fontFamily: "monospace",
                        color: "var(--text-muted)",
                      }}
                    >
                      {p.userId.slice(-8)}
                    </span>
                  )}
                  {u?.username && <span> @{u.username}</span>}
                </div>
              </div>
            );
          })}
        {!loading && !error && (
          <div
            style={{
              display: "flex",
              padding: 10,
              gap: 6,
              borderTop: "1px solid var(--border)",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "white",
                fontSize: 12,
                opacity: page === 0 ? 0.5 : 1,
                cursor: page === 0 ? "default" : "pointer",
              }}
            >
              ← Назад
            </button>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                alignSelf: "center",
              }}
            >
              стр. {page + 1}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={rows.length < PAGE_SIZE}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "white",
                fontSize: 12,
                opacity: rows.length < PAGE_SIZE ? 0.5 : 1,
                cursor: rows.length < PAGE_SIZE ? "default" : "pointer",
              }}
            >
              Вперёд →
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
