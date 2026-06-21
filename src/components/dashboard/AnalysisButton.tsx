"use client";

import React from "react";
import { CameraIcon } from "@/components/ui/Icons";
import { motion } from "framer-motion";

interface AnalysisButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export const AnalysisButton: React.FC<AnalysisButtonProps> = ({
  onPress,
  disabled,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      style={{ marginBottom: 16 }}
    >
      <motion.button
        onClick={onPress}
        disabled={disabled}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
        animate={
          !disabled
            ? {
                boxShadow: [
                  "0 4px 20px rgba(255, 143, 163, 0.3)",
                  "0 4px 30px rgba(255, 143, 163, 0.5)",
                  "0 4px 20px rgba(255, 143, 163, 0.3)",
                ],
              }
            : undefined
        }
        transition={{ duration: 2, repeat: Infinity }}
        style={{
          width: "100%",
          padding: "18px 24px",
          borderRadius: 24,
          background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
          color: "white",
          fontSize: 17,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: disabled ? 0.5 : 1,
          border: "none",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <CameraIcon size={24} />
        Сделать анализ кожи
      </motion.button>
    </motion.div>
  );
};
