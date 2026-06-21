"use client";

import React from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[ErrorBoundary]", error.message, error.stack);
  }, [error]);

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
        &#128683;
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Что-то пошло не так</h2>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 300, lineHeight: 1.5 }}>
        Произошла ошибка. Мы уже знаем о проблеме и работаем над её исправлением.
      </p>
      <button
        onClick={reset}
        style={{
          padding: "12px 28px",
          borderRadius: 20,
          background: "var(--primary)",
          color: "white",
          fontSize: 15,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
        }}
      >
        Попробовать снова
      </button>
    </div>
  );
}
