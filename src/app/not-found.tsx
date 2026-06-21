"use client";

import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60dvh",
        padding: "40px 24px",
        textAlign: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
        }}
      >
        &#128064;
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Страница не найдена</h2>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Такой страницы нет. Вернитесь на главную.
      </p>
      <Link
        href="/"
        style={{
          padding: "12px 28px",
          borderRadius: 20,
          background: "var(--primary)",
          color: "white",
          fontSize: 15,
          fontWeight: 600,
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        На главную
      </Link>
    </div>
  );
}
