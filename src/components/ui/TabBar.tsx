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

const RatingIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M8.56 2.9l-6.4 9.6c-.5.7-.1 1.6.6 1.6h8.48l-2.8 7.6c-.3.9.7 1.5 1.4.8l10.4-9.8c.5-.5.1-1.3-.6-1.3h-8.48l2.8-7.6c.3-.9-.7-1.5-1.4-.8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ProfileIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M4 21c0-4.5 3.5-8 8-8s8 3.5 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const TABS: Tab[] = [
  { key: "home", label: "Главная", path: "/", icon: <HomeIcon size={22} /> },
  { key: "history", label: "История", path: "/history", icon: <HistoryIcon size={22} /> },
  { key: "chat", label: "Чат", path: "/chat", icon: <ChatIcon size={22} /> },
  { key: "rating", label: "Рейтинг", path: "/rating", icon: <RatingIcon size={22} /> },
  { key: "profile", label: "Профиль", path: "/profile", icon: <ProfileIcon size={22} /> },
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
        background: "rgba(255, 255, 255, 0.78)",
        backdropFilter: "blur(16px) saturate(140%)",
        WebkitBackdropFilter: "blur(16px) saturate(140%)",
        borderRadius: "24px 24px 0 0",
        boxShadow: "0 -4px 30px rgba(200, 140, 150, 0.1)",
        padding: "6px 4px",
        paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
        zIndex: 50,
        display: "flex",
        justifyContent: "space-around",
        borderTop: "1px solid rgba(240, 228, 230, 0.5)",
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
              minWidth: 48,
            }}
          >
            <div style={{ opacity: active ? 1 : 0.5, color: active ? "var(--primary-dark)" : "var(--text-muted)", transition: "all 0.2s" }}>
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
