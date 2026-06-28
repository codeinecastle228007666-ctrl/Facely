"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const OfflineBanner: React.FC = () => {
  const [online, setOnline] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          style={{
            position: "fixed",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 430,
            // 2026-06-28 — bumped from 500 → 999. Onboarding (zIndex
            // 600) would otherwise render OVER an offline banner,
            // leaving the user on the welcome screen with no clue
            // they're disconnected. 999 keeps it above everything
            // except modals we explicitly promote (e.g. error overlays).
            zIndex: 999,
            padding: "10px 16px",
            background: "linear-gradient(135deg, #E07A8E, #E8A0B4)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: "0 2px 12px rgba(224, 122, 142, 0.3)",
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>📡</span>
          <span>Нет подключения к интернету</span>
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              padding: "4px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.2)",
              color: "white",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.3)",
              cursor: retrying ? "default" : "pointer",
              opacity: retrying ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {retrying ? "..." : "Повторить"}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
