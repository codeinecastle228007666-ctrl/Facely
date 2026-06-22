"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";
import { BrowserMultiFormatReader } from "@zxing/library";

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "choose" | "link" | "photo" | "manual" | "barcode";

const STEPS: { key: Step; icon: string; title: string; desc: string }[] = [
  { key: "barcode", icon: "📱", title: "Штрих-код", desc: "Наведите камеру на штрих-код упаковки" },
  { key: "link", icon: "🔗", title: "Ссылка на товар", desc: "Вставьте ссылку на Wildberries, Ozon или любой маркетплейс" },
  { key: "photo", icon: "📷", title: "Фото состава", desc: "Сфотографируйте состав на упаковке" },
  { key: "manual", icon: "✏️", title: "Ввести вручную", desc: "Введите название и состав средства" },
];

export const AddProductModal: React.FC<AddProductModalProps> = ({ open, onClose, onSuccess }) => {
  const [step, setStep] = useState<Step | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [barcode, setBarcode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);

  const reset = () => { setStep(null); setUrl(""); setName(""); setBrand(""); setIngredients(""); setError(""); setBarcode(""); };

  useEffect(() => {
    if (!open) {
      scannerRef.current?.reset();
      scannerRef.current = null;
    }
  }, [open]);

  const startScanner = useCallback(async () => {
    try {
      const reader = new BrowserMultiFormatReader();
      scannerRef.current = reader;
      reader.decodeFromVideoDevice(null, videoRef.current!, (result) => {
        if (result) {
          const code = result.getText();
          setBarcode(code);
          reader.reset();
          scannerRef.current = null;
          setLoading(true);
          api.inventory.add({ source: "barcode", sourceUrl: code })
            .then(() => { onSuccess(); reset(); onClose(); })
            .catch(() => { setError("Товар не найден в базе. Введите вручную."); setStep("manual"); setName(""); })
            .finally(() => setLoading(false));
        }
      });
    } catch {
      setError("Не удалось открыть камеру");
    }
  }, [onSuccess, onClose]);

  const compressImage = useCallback((dataUrl: string, maxDim = 1080, quality = 0.85): Promise<string> => {
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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string);
      setLoading(true);
      try {
        await api.inventory.add({ source: "photo", imageBase64: compressed });
        onSuccess();
        reset();
        onClose();
      } catch { setError("Ошибка при анализе фото"); } finally { setLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      if (step === "link") {
        if (!url.trim()) { setError("Введите ссылку"); setLoading(false); return; }
        await api.inventory.add({ source: "link", sourceUrl: url, name: name || undefined, brand: brand || undefined, ingredients: ingredients || undefined });
      } else if (step === "manual") {
        if (!name.trim()) { setError("Введите название средства"); setLoading(false); return; }
        await api.inventory.add({ source: "manual", name, brand: brand || undefined, ingredients: ingredients || undefined });
      }
      onSuccess();
      reset();
      onClose();
    } catch { setError("Ошибка при добавлении"); } finally { setLoading(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => { scannerRef.current?.reset(); scannerRef.current = null; onClose(); reset(); }}
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
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>{step === "barcode" ? "Сканирование" : step ? "Добавить средство" : "Добавить в инвентарь"}</h3>
              <button onClick={() => { scannerRef.current?.reset(); scannerRef.current = null; onClose(); reset(); }}><CloseIcon size={22} /></button>
            </div>

            {!step && (
              <div className="flex flex-col gap-3">
                {STEPS.map((s) => (
                  <motion.button
                    key={s.key}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setStep(s.key); if (s.key === "barcode") setTimeout(startScanner, 100); }}
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

            {step === "barcode" && (
              <div>
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 16, overflow: "hidden", background: "#000", marginBottom: 12, position: "relative" }}>
                  <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {loading && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", color: "white", fontSize: 14 }}>
                      Ищем товар...
                    </div>
                  )}
                </div>
                {barcode && <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Штрих-код: {barcode}</div>}
              </div>
            )}

            {step === "link" && (
              <div>
                <input
                  placeholder="https://www.wildberries.ru/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }}
                />
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Если название не определилось автоматически, заполните вручную:</div>
                <input placeholder="Название средства" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
                <input placeholder="Бренд (необязательно)" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
                <textarea placeholder="Состав (скопируйте INCI-состав со страницы)" value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={3} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, resize: "none", marginBottom: 12, background: "var(--bg)" }} />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ width: "100%", padding: "16px", borderRadius: 16, background: loading ? "var(--border)" : "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: loading ? "default" : "pointer" }}
                >
                  {loading ? "Анализируем..." : "Добавить"}
                </motion.button>
              </div>
            )}

            {step === "photo" && (
              <div>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ width: "100%", height: 160, borderRadius: 16, border: "2px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--bg)", cursor: "pointer", marginBottom: 12 }}
                >
                  <span style={{ fontSize: 36 }}>📷</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>Нажмите, чтобы сфотографировать состав</span>
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleFile} style={{ display: "none" }} />
                {loading && <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>Распознаём состав...</div>}
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
                  disabled={loading}
                  style={{ width: "100%", padding: "16px", borderRadius: 16, background: loading ? "var(--border)" : "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: loading ? "default" : "pointer" }}
                >
                  {loading ? "Анализируем..." : "Добавить"}
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