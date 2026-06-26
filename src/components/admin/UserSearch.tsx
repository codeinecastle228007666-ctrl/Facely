"use client";

import React, { useEffect, useState, useCallback } from "react";
import { adminApi, type UserSummary } from "./adminApi";

interface Props {
  onPick: (user: { id: string; name: string | null; username: string | null; telegramId: string }) => void;
  selectedId: string | null;
}

/**
 * Search bar + result list. 200 ms debounce, MAX 15 hits per query.
 * Sorting comes from the server (paidAnalyses DESC, then createdAt DESC).
 */
export const UserSearch: React.FC<Props> = ({ onPick, selectedId }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [searching, setSearching] = useState(false);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const r = await adminApi.searchUsers({ query: q.trim() });
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce: 200 ms after the last keystroke.
  useEffect(() => {
    const t = setTimeout(() => run(query), 200);
    return () => clearTimeout(t);
  }, [query, run]);

  return (
    <section style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        🔍 Поиск по Telegram ID / @username / имени
      </label>
      <input
        type="text"
        placeholder='напр. 5104952330 или ivanov или "Анна"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          fontSize: 14,
          background: "white",
          marginBottom: 8,
        }}
      />

      {searching && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Поиск…</div>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((u) => {
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
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: `1px solid ${
                    isSelected ? "var(--primary)" : "var(--border)"
                  }`,
                  background: isSelected
                    ? "rgba(232, 160, 180, 0.08)"
                    : "white",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {u.name || "(без имени)"}{" "}
                  {u.username && (
                    <span
                      style={{ color: "var(--text-muted)", fontWeight: 400 }}
                    >
                      @{u.username}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontFamily: "monospace",
                  }}
                >
                  id {u.telegramId} · lvl {u.level}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            padding: "8px 0",
          }}
        >
          Никто не найдено.
        </div>
      )}
    </section>
  );
};
