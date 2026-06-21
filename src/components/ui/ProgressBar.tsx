"use client";

import React from "react";
import { motion } from "framer-motion";

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  color = "var(--primary)",
  height = 8,
  className,
}) => {
  const pct = Math.min(100, Math.round((value / max) * 100));

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height,
        background: "var(--border)",
        borderRadius: height,
        overflow: "hidden",
      }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          height: "100%",
          background: color,
          borderRadius: height,
        }}
      />
    </div>
  );
};
