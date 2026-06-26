"use client";

import React, { useState } from "react";
import { adminApi, type UserDetails as UserDetailsT } from "./adminApi";

interface Props {
  user: UserDetailsT;
  onGrantSuccess: () => void;
}

type Kind =
  | "paidAnalyses"
  | "freeChatQuestions"
  | "streakFreeze"
  | "subscriptionDays"
  | "proTrialDays"
  | "xp";

const KIND_OPTIONS: { value: Kind; label: string; unit: string; defaultAmount: number }[] = [
  { value: "paidAnalyses", label: "Платных анализов", unit: "шт", defaultAmount: 5 },
  { value: "freeChatQuestions", label: "Вопросов чата", unit: "шт", defaultAmount: 10 },
  { value: "streakFreeze", label: "Streak freezes", unit: "шт", defaultAmount: 1 },
  { value: "subscriptionDays", label: "Дней подписки", unit: "дн", defaultAmount: 30 },
  { value: "proTrialDays", label: "Дней Pro-trial", unit: "дн", defaultAmount: 7 },
  { value: "xp", label: "XP", unit: "XP", defaultAmount: 50 },
];

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Selected user card + grant form on the same panel (one card per
 * selected user — no toggle). Shows current balances, current
 * subscription, current ritual stats — all in a compact grid.
 */
export const UserDetails: React.FC<Props> = ({ user, onGrantSuccess }) => {
  const [kind, setKind] = useState<Kind>("paidAnalyses");
  const [amount, setAmount] = useState<number>(5);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setKindAndDefault = (k: Kind) => {
    setKind(k);
    const opt = KIND_OPTIONS.find((o) => o.value === k);
    setAmount(opt?.defaultAmount ?? 1);
    setSuccess(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await adminApi.grant({
        targetUserId: user.id,
        kind,
        amount,
        reason: reason.trim() || undefined,
      });
      const label = KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
      setSuccess(`Начислено: ${label} × ${amount}`);
      setReason("");
      onGrantSuccess();
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const opt = KIND_OPTIONS.find((o) => o.value === kind);
  const sub = user.subscription;
  const subActive = sub?.status === "active" && sub?.endDate;

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {user.name || "(без имени)"}
          </div>
          <div
            style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
          >
            {user.username && <>@{user.username} · </>}
            <span style={{ fontFamily: "monospace" }}>id {user.telegramId}</span>
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textAlign: "right",
            fontFamily: "monospace",
          }}
        >
          db&nbsp;<span title={user.id}>{user.id.slice(-8)}</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          paddingTop: 12,
          borderTop: "1px dashed var(--border)",
        }}
      >
        <Field label="Уровень" value={`${user.level} · ${user.xp} XP`} />
        <Field
          label="Платных анализов"
          value={user.paidAnalyses}
          accent
        />
        <Field label="Бесплатных" value={user.freeAnalyses} />
        <Field label="Вопросов чата" value={user.freeChatQuestions} />
        <Field label="Streak freezes" value={user.streakFreezes} />
        <Field label="Месячная badge" value={user.monthStreakBadge ? "Есть ✓" : "Нет"} />
        <Field label="Pro-trial до" value={fmtDate(user.proTrialUntil)} />
        <Field
          label="Подписка"
          value={
            subActive
              ? `${sub?.type} · до ${fmtDate(sub?.endDate)}`
              : "Нет"
          }
          accent={!!subActive}
        />
        <Field
          label="Стрик"
          value={
            user.rituals
              ? `${user.rituals.streak} (макс ${user.rituals.maxStreak})`
              : "—"
          }
        />
        <Field label="Анализов всего" value={String(user.freeAnalyses + user.paidAnalyses)} />
      </div>

      <form
        onSubmit={submit}
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px dashed var(--border)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Начислить
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={kind}
            onChange={(e) => setKindAndDefault(e.target.value as Kind)}
            style={{
              flex: 1,
              minWidth: 160,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "white",
              fontSize: 13,
            }}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={10000}
            value={amount}
            onChange={(e) =>
              setAmount(Math.max(1, Math.min(10000, Number(e.target.value) || 0)))
            }
            style={{
              width: 84,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              fontSize: 13,
              textAlign: "right",
            }}
          />
          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              minWidth: 24,
            }}
          >
            {opt?.unit}
          </span>
        </div>
        <input
          type="text"
          placeholder="Причина (опционально, например «компенсация за простой»)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            fontSize: 13,
            marginBottom: 8,
          }}
        />
        <button
          type="submit"
          disabled={busy || amount < 1}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 999,
            border: "none",
            background: "var(--primary-dark)",
            color: "white",
            fontWeight: 600,
            fontSize: 13,
            opacity: busy || amount < 1 ? 0.5 : 1,
            cursor: busy || amount < 1 ? "default" : "pointer",
          }}
        >
          {busy
            ? "Начисление…"
            : `✓ Начислить ${opt?.label ?? kind} × ${amount}`}
        </button>
        {error && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#c06575",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#5a9b78",
              textAlign: "center",
            }}
          >
            {success}
          </div>
        )}
      </form>
    </section>
  );
};

const Field: React.FC<{
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}> = ({ label, value, accent }) => (
  <div
    style={{
      padding: "8px 10px",
      borderRadius: 10,
      background: accent ? "rgba(232, 160, 180, 0.08)" : "var(--bg)",
      border: `1px solid ${accent ? "var(--primary-light)" : "var(--border)"}`,
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
    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
  </div>
);
