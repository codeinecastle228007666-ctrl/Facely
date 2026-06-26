"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  adminApi,
  type CardClaimRow,
  type UserSummary,
} from "./adminApi";

interface Props {
  refreshKey: number;
  /** Optional userIds→UserSummary map so we can resolve user names
   * without re-querying (StarsInvoicesFeed also benefits from this). */
  userIndex?: Record<string, UserSummary>;
  onUserPicked?: (user: { id: string; name: string | null; username: string | null; telegramId: string }) => void;
}

type StatusFilter = "pending" | "drafts" | "confirmed" | "all";
const PAGE_SIZE = 20;

const TIER_LABEL: Record<string, string> = {
  single: "1 Анализ",
  pack5: "5 Анализов",
  monthly: "Безлимит / мес",
  fifteen: "15 Анализов",
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
 * CardTransferClaim admin surface — list, then per-row Confirm or
 * Cancel. Both actions are idempotent (server throws if already
 * creditConfirmed; client disables button after first click). The
 * Cancel flow prompts for a reason via `prompt()` — minimum-friction
 * UX, fine for the single-admin MVP.
 */
export const PendingClaimsPanel: React.FC<Props> = ({
  refreshKey,
  userIndex,
  onUserPicked,
}) => {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CardClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = useCallback(
    async (f: StatusFilter, p: number) => {
      setLoading(true);
      setError(null);
      try {
        setRows(
          await adminApi.listCardClaims({
            status: f,
            offset: p * PAGE_SIZE,
            limit: PAGE_SIZE,
          }),
        );
      } catch (e: any) {
        setError(e?.message || "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    run(filter, page);
  }, [filter, page, run]);

  // refreshKey → reset to page 0; the page state change above re-drives
  // the run effect. Single round-trip per refresh instead of 2–3.
  useEffect(() => {
    setPage(0);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    run(filter, page);
  }, [run, filter, page]);

  const confirm = async (claim: CardClaimRow) => {
    if (busyId) return;
    const ok = window.confirm(
      `Подтвердить заявку ${claim.expectedReference} для ${
        claim.user.name || claim.user.username || claim.user.telegramId
      } (${TIER_LABEL[claim.tier] ?? claim.tier}, ${claim.amount}₽)?`,
    );
    if (!ok) return;
    setBusyId(claim.id);
    try {
      await adminApi.confirmCardClaim({ claimId: claim.id });
      await refresh();
    } catch (e: any) {
      window.alert(`Ошибка: ${e?.message ?? "не удалось подтвердить"}`);
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (claim: CardClaimRow) => {
    if (busyId) return;
    const reason = window.prompt(
      `Отменить заявку ${claim.expectedReference}? Укажите причину (опц.):`,
    );
    // prompt() returns null on cancel; "" on submit empty — treat null as abort.
    if (reason === null) return;
    setBusyId(claim.id);
    try {
      await adminApi.cancelCardClaim({
        claimId: claim.id,
        reason: reason.trim() || undefined,
      });
      await refresh();
    } catch (e: any) {
      window.alert(`Ошибка: ${e?.message ?? "не удалось отменить"}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section id="claims" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
          💳 Заявки на оплату переводом
        </h2>
        <button
          type="button"
          onClick={refresh}
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
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        {(["pending", "drafts", "confirmed", "all"] as StatusFilter[]).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${
                  filter === f ? "var(--primary)" : "var(--border)"
                }`,
                background: filter === f ? "var(--primary-light)" : "white",
                fontSize: 12,
                color: filter === f ? "var(--primary-dark)" : "var(--text)",
              }}
            >
              {f === "pending"
                ? "⏳ Ожидают"
                : f === "drafts"
                ? "📝 Черновики"
                : f === "confirmed"
                ? "✅ Закрыты"
                : "🔎 Все"}
            </button>
          ),
        )}
      </div>
      <div
        className="card"
        style={{ padding: 0, overflow: "hidden" }}
      >
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
        {!loading && !error && rows.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            {filter === "pending"
              ? "Нет ожидающих заявок."
              : filter === "drafts"
              ? "Нет черновиков."
              : filter === "confirmed"
              ? "Нет закрытых."
              : "Пусто."}
          </div>
        )}
        {!loading &&
          !error &&
          rows.map((c) => {
            const isConfirmed = c.creditConfirmed;
            const inlineUser = userIndex?.[c.userId];
            const userLabel =
              inlineUser?.name ||
              c.user.name ||
              "(без имени)";
            const userHandle = inlineUser?.username ?? c.user.username;
            return (
              <div
                key={c.id}
                style={{
                  padding: "12px 14px",
                  borderTop: "1px solid var(--border)",
                  fontSize: 12,
                  opacity: isConfirmed ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {c.expectedReference}{" "}
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontWeight: 400,
                      }}
                    >
                      · {TIER_LABEL[c.tier] ?? c.tier} · {c.amount}₽
                    </span>
                  </span>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    {fmtTime(c.claimedAt)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "var(--text-muted)",
                  }}
                >
                  →{" "}
                  {onUserPicked ? (
                    <button
                      type="button"
                      onClick={() =>
                        onUserPicked({
                          id: c.userId,
                          name: c.user.name,
                          username: c.user.username,
                          telegramId: c.user.telegramId,
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
                  )}
                  {userHandle && (
                    <span> @{userHandle}</span>
                  )}{" "}
                  <span style={{ fontFamily: "monospace" }}>
                    ({c.user.telegramId})
                  </span>
                </div>
                {!isConfirmed && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => confirm(c)}
                      disabled={busyId === c.id}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: "none",
                        background: "var(--primary-dark)",
                        color: "white",
                        fontSize: 12,
                        fontWeight: 600,
                        opacity: busyId === c.id ? 0.5 : 1,
                        cursor: busyId === c.id ? "default" : "pointer",
                      }}
                    >
                      ✓ Подтвердить
                    </button>
                    <button
                      type="button"
                      onClick={() => cancel(c)}
                      disabled={busyId === c.id}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "white",
                        fontSize: 12,
                        opacity: busyId === c.id ? 0.5 : 1,
                        cursor: busyId === c.id ? "default" : "pointer",
                      }}
                    >
                      ✕ Отменить
                    </button>
                  </div>
                )}
                {isConfirmed && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    Закрыта {c.creditConfirmedAt ? fmtTime(c.creditConfirmedAt) : ""}
                  </div>
                )}
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
