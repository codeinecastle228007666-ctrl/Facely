"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { HistoryIcon, ChartIcon, ShareIcon, StarIcon } from "./Icons";

interface Tab {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { key: "home", label: "Главная", path: "/", icon: <StarIcon size={22} /> },
  { key: "history", label: "История", path: "/history", icon: <HistoryIcon size={22} /> },
  { key: "report", label: "Отчёт", path: "/report", icon: <ChartIcon size={22} /> },
  { key: "referral", label: "Друзья", path: "/referral", icon: <ShareIcon size={22} /> },
];

export const TabBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 430,
        background: "white",
        borderRadius: "20px 20px 0 0",
        boxShadow: "0 -4px 24px rgba(200, 140, 150, 0.1)",
        padding: "8px 12px",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
        zIndex: 50,
        display: "flex",
        justifyContent: "space-around",
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.path;

        return (
          <button
            key={tab.key}
            onClick={() => router.push(tab.path)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "6px 12px",
              borderRadius: 12,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              position: "relative",
              minWidth: 64,
            }}
          >
            <div style={{ opacity: active ? 1 : 0.45, transition: "opacity 0.2s" }}>
              {tab.icon}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--primary-dark)" : "var(--text-muted)",
              }}
            >
              {tab.label}
            </span>
            {active && (
              <motion.div
                layoutId="tabIndicator"
                style={{
                  position: "absolute",
                  top: 0,
                  left: "20%",
                  right: "20%",
                  height: 3,
                  borderRadius: 2,
                  background: "var(--primary)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
