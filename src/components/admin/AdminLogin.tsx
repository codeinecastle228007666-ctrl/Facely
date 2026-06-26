"use client";

import React, { useState } from "react";
import { adminApi } from "./adminApi";

interface Props {
  onSuccess: () => void;
}

/**
 * /admin gate: paste ADMIN_PANEL_SECRET to receive the
 * `admin_session` cookie. No user accounts, just a shared secret —
 * matches the single-operator MVP.
 */
export const AdminLogin: React.FC<Props> = ({ onSuccess }) => {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(secret);
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Wrong secret");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        className="card"
        style={{ width: "100%", maxWidth: 380 }}
      >
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>
          🔒 Reveli admin
        </h1>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          Введите <code>ADMIN_PANEL_SECRET</code>:
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="••••••••••••••••"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            fontSize: 14,
            marginBottom: 12,
            background: "var(--bg)",
          }}
        />
        <button
          type="submit"
          disabled={busy || !secret}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 999,
            border: "none",
            background: "var(--primary-dark)",
            color: "white",
            fontWeight: 600,
            fontSize: 14,
            opacity: busy || !secret ? 0.5 : 1,
            cursor: busy || !secret ? "default" : "pointer",
          }}
        >
          {busy ? "Проверка…" : "Войти"}
        </button>
        {error && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "#c06575",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
      </form>
    </main>
  );
};
