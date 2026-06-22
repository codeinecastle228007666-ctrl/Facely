"use client";

import React from "react";

export const Skeleton: React.FC<{
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}> = ({ width = "100%", height = 16, borderRadius = 12, style }) => (
  <div
    style={{
      width,
      height,
      borderRadius,
      background: "linear-gradient(90deg, var(--border) 25%, var(--bg) 50%, var(--border) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s ease-in-out infinite",
      ...style,
    }}
  />
);

export const CardSkeleton: React.FC = () => (
  <div className="card" style={{ padding: 16, marginBottom: 10 }}>
    <div className="flex gap-3">
      <Skeleton width={64} height={64} borderRadius={14} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="80%" height={12} />
        <div className="flex gap-2">
          <Skeleton width={60} height={20} borderRadius={10} />
          <Skeleton width={80} height={20} borderRadius={10} />
        </div>
      </div>
    </div>
  </div>
);

export const ProfileSkeleton: React.FC = () => (
  <div className="card flex items-center gap-3" style={{ padding: 16, marginBottom: 12 }}>
    <Skeleton width={48} height={48} borderRadius="50%" />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
      <Skeleton width="40%" height={16} />
      <Skeleton width="60%" height={12} />
    </div>
  </div>
);
