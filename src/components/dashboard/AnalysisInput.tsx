"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CameraIcon, LockIcon } from "@/components/ui/Icons";
import { useTelegram } from "@/hooks/useTelegram";

interface AnalysisInputProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (photoBase64: string, description?: string) => void;
  loading?: boolean;
}

const TIPS = [
  { icon: "☀️", text: "Хорошее освещение — лицо равномерно освещено, без теней" },
  { icon: "🧴", text: "Чистая кожа — без макияжа и уходовых средств" },
  { icon: "📸", text: "Фото анфас, смотрите прямо в камеру" },
  { icon: "⬆️", text: "Держите телефон на уровне лица" },
];

export const AnalysisInput: React.FC<AnalysisInputProps> = ({
  open,
  onClose,
  onSubmit,
  loading,
}) => {
  const [step, setStep] = useState<"tutorial" | "photo">("tutorial");
  const [photo, setPhoto] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { impact } = useTelegram();

  const compressImage = (dataUrl: string, maxDim = 1080, quality = 0.85): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.src = dataUrl;
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string);
      setPhoto(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!photo) return;
    impact("medium");
    onSubmit(photo, description || undefined);
  };

  const reset = () => {
    setStep("tutorial");
    setPhoto(null);
    setDescription("");
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
          onClick={() => { onClose(); reset(); }}
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
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {step === "tutorial" && (
              <>
                <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>Как сделать фото</h3>
                  <button onClick={() => { onClose(); reset(); }}>
                    <CloseIcon size={22} />
                  </button>
                </div>

                <div className="flex flex-col gap-3" style={{ marginBottom: 20 }}>
                  {TIPS.map((tip, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-3"
                      style={{
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: "var(--bg)",
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{tip.icon}</span>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        {tip.text}
                      </span>
                    </motion.div>
                  ))}
                </div>

                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "rgba(168, 216, 234, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <LockIcon size={24} />
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    <strong style={{ color: "var(--text)" }}>Безопасно и конфиденциально</strong>
                    <br />
                    Фото шифруются при передаче и не сохраняются на сервере после анализа. Мы не передаём их третьим лицам.
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { impact("light"); setStep("photo"); }}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: 16,
                    background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                    color: "white",
                    fontSize: 16,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Загрузить фото
                </motion.button>
              </>
            )}

            {step === "photo" && (
              <>
                <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                    {photo ? "Фото загружено" : "Загрузите фото"}
                  </h3>
                  <button onClick={() => { onClose(); reset(); }}>
                    <CloseIcon size={22} />
                  </button>
                </div>

                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    width: "100%",
                    height: 180,
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
                        Нажмите, чтобы выбрать фото
                      </span>
                    </>
                  )}
                  {photo && (
                    <div
                      onClick={(e) => { e.stopPropagation(); setPhoto(null); }}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: 16,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </div>
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
                    marginBottom: 16,
                    border: "1px solid var(--border)",
                  }}
                />

                <div className="flex gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => reset()}
                    style={{
                      padding: "16px",
                      borderRadius: 16,
                      background: "var(--bg)",
                      color: "var(--text-secondary)",
                      fontSize: 14,
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Назад
                  </motion.button>
                  <motion.button
                    onClick={handleSubmit}
                    disabled={!photo || loading}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      flex: 1,
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
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
