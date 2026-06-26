"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { UserSearch } from "@/components/admin/UserSearch";
import { UserDetails } from "@/components/admin/UserDetails";
import { RecentGrants } from "@/components/admin/RecentGrants";
import { AllUsersList } from "@/components/admin/AllUsersList";
import { PendingClaimsPanel } from "@/components/admin/PendingClaimsPanel";
import { StarsInvoicesFeed } from "@/components/admin/StarsInvoicesFeed";
import { DashStats } from "@/components/admin/DashStats";
import {
  adminApi,
  type UserDetails as UserDetailsT,
} from "@/components/admin/adminApi";

/**
 * /admin — operator-only panel. Lives OUTSIDE Telegram Mini App
 * (no Telegram WebApp context, no TRPCProvider). Standalone CSS
 * theme piggy-backs on the same `var(--*)` palette used by the
 * main app for visual continuity.
 *
 * 2026-06-26 Phase 2 — full admin surface. Long single-scroll
 * layout with anchor-driven mini-nav (Stats / Users / Claims /
 * Stars / Audit). Single-admin MVP keeps the structure flat so
 * every panel is one click away. UserDetails is sticky-once-picked
 * (persisted across sections so admin can pivot from a card-claim
 * to the user's audit or apply a manual grant without losing state).
 *
 * State machine:
 *   enabled = false        → "panel disabled" message
 *   enabled, !authed       → AdminLogin form
 *   enabled, authed        → main surface (this component's body)
 */
export default function AdminPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetailsT | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Bootstrap: ask server if panel is enabled (public) + try admin.me().
  useEffect(() => {
    let cancelled = false;
    adminApi
      .status()
      .then((s) => {
        if (!cancelled) setEnabled(!!s.enabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    // admin.me() rejects UNAUTHORIZED without a valid cookie. We just
    // inspect the status code — not the error body — to keep the
    // probe cheap.
    fetch("/api/trpc/admin.me?input=" + encodeURIComponent("{}"), {
      method: "GET",
      credentials: "include",
    })
      .then((r) => {
        if (!cancelled) setAuthed(r.ok);
      })
      .catch(() => {
        if (!cancelled) setAuthed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLogin = useCallback(() => {
    setAuthed(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const onLogout = useCallback(async () => {
    try {
      await adminApi.logout();
    } catch {
      /* ignore — best effort */
    }
    setAuthed(false);
    setSelectedUser(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const onUserPicked = useCallback(async (user: { id: string }) => {
    const details = await adminApi.getUserDetails({ id: user.id });
    setSelectedUser(details);
    // After picking via search/list, scroll the UserDetails card into
    // view. Skip if user clicked a name inside Claims/Stars panels —
    // they still set selectedUser but the anchor-based jump is the
    // caller's responsibility (we don't unconditionally scroll).
  }, []);

  const onGrantsRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    if (selectedUser) {
      adminApi.getUserDetails({ id: selectedUser.id }).then((u) =>
        setSelectedUser(u),
      );
    }
  }, [selectedUser]);

  // Loading state — wait until both enabled + authed resolved.
  if (enabled === null || authed === null) {
    return (
      <main
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        Загрузка…
      </main>
    );
  }

  if (!enabled) {
    return (
      <main
        style={{
          padding: 24,
          color: "var(--text-muted)",
          textAlign: "center",
          marginTop: 40,
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
        <h1
          style={{
            fontSize: 18,
            margin: "0 0 8px 0",
            color: "var(--text)",
          }}
        >
          Панель администратора отключена
        </h1>
        <div style={{ fontSize: 13 }}>
          Задайте <code>ADMIN_PANEL_SECRET</code> (≥8 символов) в Vercel
          Environment Variables, пересоберите проект, и откройте
          страницу ещё раз.
        </div>
      </main>
    );
  }

  if (!authed) {
    return <AdminLogin onSuccess={onLogin} />;
  }

  return (
    <main style={{ paddingBottom: 32 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 0 12px",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            Панель администратора
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Reveli · сессия активна 8 ч
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "white",
            fontSize: 13,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Выйти
        </button>
      </header>

      <nav
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {(
          [
            ["dashboard", "📊 Статистика"],
            ["users", "👥 Юзеры"],
            ["claims", "💳 Заявки"],
            ["stars", "⭐ Stars"],
            ["audit", "📜 Audit"],
          ] as const
        ).map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "white",
              fontSize: 12,
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      <DashStats refreshKey={refreshKey} />

      <div id="users" style={{ scrollMarginTop: 16 }}>
        <UserSearch onPick={onUserPicked} selectedId={selectedUser?.id ?? null} />
        {selectedUser && (
          <UserDetails
            user={selectedUser}
            onGrantSuccess={onGrantsRefresh}
          />
        )}
        <AllUsersList
          onPick={onUserPicked}
          selectedId={selectedUser?.id ?? null}
          refreshKey={refreshKey}
        />
      </div>

      <PendingClaimsPanel
        refreshKey={refreshKey}
        onUserPicked={onUserPicked}
      />

      <StarsInvoicesFeed refreshKey={refreshKey} />

      <div id="audit" style={{ scrollMarginTop: 16 }}>
        <RecentGrants refreshKey={refreshKey} />
      </div>
    </main>
  );
}
