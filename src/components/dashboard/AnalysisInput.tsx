"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CameraIcon } from "@/components/ui/Icons";
import { useTelegram } from "@/hooks/useTelegram";

interface AnalysisInputProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (photoBase64: string, description?: string) => void;
  loading?: boolean;
}

export const AnalysisInput: React.FC<AnalysisInputProps> = ({
  open,
  onClose,
  onSubmit,
  loading,
}) => {
  const [photo, setPhoto] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { impact } = useTelegram();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setPhoto(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!photo) return;
    impact("medium");
    onSubmit(photo, description || undefined);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{
              background: "white",
              width: "100%",
              maxWidth: 430,
              borderRadius: "24px 24px 0 0",
              padding: "24px 20px 32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Анализ кожи</h3>
              <button onClick={onClose}>
                <CloseIcon size={22} />
              </button>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%",
                height: 160,
                borderRadius: 16,
                border: "2px dashed var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: photo
                  ? `url(data:image/jpeg;base64,${photo}) center/cover`
                  : "var(--bg)",
                marginBottom: 16,
                cursor: "pointer",
                position: "relative",
              }}
            >
              {!photo && (
                <>
                  <CameraIcon size={36} />
                  <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                    Загрузите фото лица
                  </span>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFile}
                style={{ display: "none" }}
              />
            </div>

            <textarea
              placeholder="Опишите свои ощущения (необязательно)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 14,
                background: "var(--bg)",
                fontSize: 14,
                resize: "none",
                marginBottom: 20,
                border: "1px solid var(--border)",
              }}
            />

            <motion.button
              onClick={handleSubmit}
              disabled={!photo || loading}
              whileTap={{ scale: 0.97 }}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 16,
                background: !photo || loading
                  ? "var(--border)"
                  : "linear-gradient(135deg, var(--primary), var(--secondary))",
                color: !photo || loading ? "var(--text-muted)" : "white",
                fontSize: 16,
                fontWeight: 600,
                border: "none",
                cursor: !photo || loading ? "default" : "pointer",
              }}
            >
              {loading ? "Анализируем..." : "Начать анализ"}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
