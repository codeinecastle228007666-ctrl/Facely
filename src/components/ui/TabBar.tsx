"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { HistoryIcon, ShareIcon } from "./Icons";

interface Tab {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const HomeIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M3 12l9-9 9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 10v9a1 1 0 001 1h3v-5a1 1 0 011-1h4a1 1 0 011 1v5h3a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ChatIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M21 12a9 9 0 11-9-9 9 9 0 019 9z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const TABS: Tab[] = [
  { key: "home", label: "Главная", path: "/", icon: <HomeIcon size={22} /> },
  { key: "history", label: "История", path: "/history", icon: <HistoryIcon size={22} /> },
  { key: "chat", label: "Чат", path: "/chat", icon: <ChatIcon size={22} /> },
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
        padding: "8px 8px",
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
              padding: "6px 10px",
              borderRadius: 12,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              position: "relative",
              minWidth: 52,
            }}
          >
            <div style={{ opacity: active ? 1 : 0.45, color: active ? "var(--primary-dark)" : "var(--text-muted)", transition: "opacity 0.2s" }}>
              {tab.icon}
            </div>
            <span
              style={{
                fontSize: 9,
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
