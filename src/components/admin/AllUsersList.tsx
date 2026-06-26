"use client";

import React, { useEffect, useState } from "react";
import { adminApi, type UserSummary } from "./adminApi";

interface Props {
  onPick: (user: { id: string; name: string | null; username: string | null; telegramId: string }) => void;
  selectedId: string | null;
  /** Bump to force a re-fetch from page 0 (e.g. after admin grant). */
  refreshKey: number;
}

const PAGE_SIZE = 20;

/**
 * Browse-all users with Prev/Next pagination. Sorting comes from the
 * server (`paidAnalyses DESC, createdAt DESC`) so paying users surface
 * first. Click a row → onPick (parent renders UserDetails panel).
 */
export const AllUsersList: React.FC<Props> = ({ onPick, selectedId, refreshKey }) => {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await adminApi.listUsers({ offset: p * PAGE_SIZE, limit: PAGE_SIZE }));
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run(page);
    // refreshKey → reset to page 0 and refetch.
  }, [page]);

  useEffect(() => {
    setPage(0);
    run(0);
    // refreshKey dep intentionally drives the reset.
  }, [refreshKey]);

  return (
    <section style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
          👥 Все пользователи
        </h2>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {loading ? "…" : rows.length === 0 ? "" : `стр. ${page + 1}`}
        </span>
      </div>
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
            Больше нет пользователей.
          </div>
        )}
        {!loading &&
          !error &&
          rows.map((u) => {
            const isSelected = u.id === selectedId;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() =>
                  onPick({
                    id: u.id,
                    name: u.name,
                    username: u.username,
                    telegramId: u.telegramId,
                  })
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "none",
                  borderTop: `1px solid var(--border)`,
                  background: isSelected ? "rgba(232, 160, 180, 0.08)" : "white",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <span style={{ minWidth: 0, overflow: "hidden" }}>
                  <span style={{ fontWeight: 600 }}>
                    {u.name || "(без имени)"}
                  </span>
                  {u.username && (
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}
                      @{u.username}
                    </span>
                  )}
                  <br />
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                    }}
                  >
                    id {u.telegramId} · lvl {u.level}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: u.paidAnalyses > 0 ? "var(--primary-dark)" : "var(--text-muted)",
                    alignSelf: "center",
                  }}
                >
                  {u.paidAnalyses > 0 ? `💎 ${u.paidAnalyses}` : "—"}
                </span>
              </button>
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
