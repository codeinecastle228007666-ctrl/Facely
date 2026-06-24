"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CameraIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "choose" | "photo" | "manual";

const STEPS: { key: Step; icon: string; title: string; desc: string }[] = [
  { key: "photo", icon: "📷", title: "Фото состава", desc: "Сфотографируйте состав на упаковке или экране — ИИ прочитает текст" },
  { key: "manual", icon: "✏️", title: "Ввести вручную", desc: "Введите название и состав средства" },
];

export const AddProductModal: React.FC<AddProductModalProps> = ({ open, onClose, onSuccess }) => {
  const [step, setStep] = useState<Step | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  }, []);

  useEffect(() => {
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, []);

  const reset = () => { setStep(null); setName(""); setBrand(""); setIngredients(""); setError(""); setPhoto(null); stopCamera(); };

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1080 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setShowCamera(true);
      setPhoto(null);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch {
      fileRef.current?.click();
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")!.drawImage(video, 0, 0);
    stopCamera();
    const base64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];
    setPhoto(base64);
  }, [stopCamera]);

  const compressImage = useCallback((dataUrl: string, maxDim = 1600, quality = 0.92): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) { const ratio = Math.min(maxDim / w, maxDim / h); w = Math.round(w * ratio); h = Math.round(h * ratio); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.src = dataUrl;
    });
  }, []);

  const uploadPhoto = useCallback(async (base64: string) => {
    setLoading(true);
    setError("");
    try {
      await api.inventory.add({ source: "photo", imageBase64: base64 });
      onSuccess();
      reset();
      onClose();
    } catch { setError("ИИ не смог прочитать текст. Попробуйте сфотографировать ровнее или введите вручную."); } finally { setLoading(false); }
  }, [onSuccess, onClose]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string, 800, 0.8);
      await uploadPhoto(compressed);
    };
    reader.readAsDataURL(file);
  }, [compressImage, uploadPhoto]);

  const retakePhoto = useCallback(() => {
    setPhoto(null);
    startCamera();
  }, [startCamera]);

  const confirmPhoto = useCallback(async () => {
    if (!photo) return;
    const compressed = await compressImage(`data:image/jpeg;base64,${photo}`, 800, 0.8);
    await uploadPhoto(compressed);
  }, [photo, compressImage, uploadPhoto]);

  const handleSubmit = async () => {
    setError("");
    try {
      if (!name.trim()) { setError("Введите название средства"); return; }
      await api.inventory.add({ source: "manual", name, brand: brand || undefined, ingredients: ingredients || undefined });
      onSuccess();
      reset();
      onClose();
    } catch { setError("Ошибка при добавлении"); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => { onClose(); reset(); }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ background: "white", width: "100%", maxWidth: 430, borderRadius: "24px 24px 0 0", padding: "24px 20px 32px", maxHeight: "85vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>{step ? "Добавить средство" : "Добавить в инвентарь"}</h3>
              <button onClick={() => { onClose(); reset(); }}><CloseIcon size={22} /></button>
            </div>

            {!step && (
              <div className="flex flex-col gap-3">
                {STEPS.map((s) => (
                  <motion.button
                    key={s.key}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setStep(s.key)}
                    className="flex items-center gap-3"
                    style={{ padding: "14px 16px", borderRadius: 16, background: "var(--bg)", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                  >
                    <span style={{ fontSize: 28 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.desc}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </motion.button>
                ))}
              </div>
            )}

            {step === "photo" && !showCamera && !photo && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
                  Держите камеру ровно, без бликов. Лучше всего — сфотографируйте экран с открытым составом на сайте.
                </div>
                <div className="flex gap-3">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={startCamera}
                    style={{ flex: 1, padding: "18px", borderRadius: 16, background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                  >
                    <CameraIcon size={24} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Камера</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => fileRef.current?.click()}
                    style={{ flex: 1, padding: "18px", borderRadius: 16, border: "2px solid var(--border)", background: "var(--bg)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                  >
                    <span style={{ fontSize: 24 }}>🖼️</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Галерея</span>
                  </motion.button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
                {loading && <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>Распознаём текст...</div>}
              </div>
            )}

            {step === "photo" && showCamera && (
              <div style={{ position: "relative" }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", borderRadius: 16, aspectRatio: "3/4", objectFit: "cover", background: "#000" }}
                />
                <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 }}>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={stopCamera}
                    style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.9)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}
                  >
                    ✕
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={capturePhoto}
                    style={{ width: 64, height: 64, borderRadius: "50%", background: "white", border: "4px solid var(--primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--primary)" }} />
                  </motion.button>
                </div>
              </div>
            )}

            {step === "photo" && photo && !showCamera && (
              <div>
                <img
                  src={`data:image/jpeg;base64,${photo}`}
                  alt="preview"
                  style={{ width: "100%", borderRadius: 16, aspectRatio: "3/4", objectFit: "cover", background: "#f0f0f0" }}
                />
                <div className="flex gap-3" style={{ marginTop: 12 }}>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={retakePhoto}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, border: "2px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text)" }}
                  >
                    Переснять
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={confirmPhoto}
                    disabled={loading}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? "Распознаём..." : "Распознать"}
                  </motion.button>
                </div>
              </div>
            )}

            {step === "manual" && (
              <div>
                <input placeholder="Название средства *" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
                <input placeholder="Бренд (необязательно)" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
                <textarea placeholder="Состав (скопируйте INCI-состав с упаковки)" value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={4} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, resize: "none", marginBottom: 12, background: "var(--bg)" }} />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  style={{ width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}
                >
                  Добавить
                </motion.button>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(232, 160, 180, 0.1)", fontSize: 13, color: "#E07A8E", textAlign: "center" }}>
                {error}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};