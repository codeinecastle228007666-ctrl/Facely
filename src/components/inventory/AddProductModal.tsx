"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon, CameraIcon } from "@/components/ui/Icons";
import { api } from "@/services/api";

// ── Types ──────────────────────────────────────────────────────────

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "choose" | "barcode" | "photo" | "manual";

interface ObfProduct {
  name: string;
  brand: string;
  ingredients: string;
  imageUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Native BarcodeDetector type guard. Returns null on SSR / unsupported
 * browsers. Constructor invocation is wrapped in try/catch because some
 * browsers expose the API but throw on instantiation for unsupported
 * formats (e.g. older Chrome with "qr_code" not registered).
 */
function getBarcodeDetector(): any | null {
  if (typeof window === "undefined") return null;
  // 2026-06-28 — Drop ZXing fallback. +200KB bundle weight wasn't worth
  // it when most real-world failures on Telegram WebView (iOS 14+) are
  // simply "no BarcodeDetector" — and the manual-input fallback below
  // covers the gap.
  if (!("BarcodeDetector" in window)) return null;
  try {
    return new (window as any).BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
    });
  } catch {
    return null;
  }
}

/**
 * Client-side Open Beauty Facts lookup. We try this BEFORE the tRPC call
 * so the user sees the result without round-tripping through the server
 * (and so the server can skip its own OBF query if name/ingredients are
 * already provided).
 *
 * Returns null on network error or HTTP non-OK or `status !== 1` (OBF
 * convention: status 0 means "not found").
 */
async function fetchProductByBarcode(barcode: string): Promise<ObfProduct | null> {
  try {
    const res = await fetch(
      `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status !== 1) return null;
    const p = data?.product;
    if (!p) return null;
    return {
      name: p.product_name || "",
      brand: p.brands || "",
      ingredients: p.ingredients_text || "",
      imageUrl: p.image_front_url || "",
    };
  } catch {
    return null;
  }
}

// ── Component ──────────────────────────────────────────────────────

export const AddProductModal: React.FC<AddProductModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  // step machine
  const [step, setStep] = useState<Step>("choose");

  // manual form fields
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  // photo step state (camera + captured frame)
  const [showCamera, setShowCamera] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // barcode step state
  const [scanning, setScanning] = useState(false);
  const [barcodeSupported, setBarcodeSupported] = useState(true);
  const [manualBarcode, setManualBarcode] = useState("");
  const [foundProduct, setFoundProduct] = useState<ObfProduct | null>(null);
  // 2026-06-28 — `pendingBarcode` keeps the originally scanned/typed
  // code alive when the user transitions to the manual step (either
  // because OBF miss or because they want to fixup the data). Manual
  // submit forwards this as `source: "barcode", sourceUrl: code` so
  // the final InventoryItem.source column truthfully reflects the
  // provenance (vs. lying as "manual").
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any | null>(null);
  const rafRef = useRef<number>(0);

  // ── Camera cleanup ─────────────────────────────────────────────
  // Single source of truth: streamRef / scanStreamRef. `scanning` /
  // `showCamera` flags can be stale in async RAF loops, but a Ref read
  // always reflects the live state at the moment of inspection.

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  }, []);

  const stopScanner = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (scanStreamRef.current) {
      scanStreamRef.current.getTracks().forEach((t) => t.stop());
      scanStreamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      scanStreamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    setStep("choose");
    setName(""); setBrand(""); setIngredients("");
    setError(""); setHint(""); setPhoto(null);
    setBarcodeSupported(true); setManualBarcode("");
    setFoundProduct(null); setPendingBarcode(null);
    stopCamera(); stopScanner();
  }, [stopCamera, stopScanner]);

  // ── Photo helpers ──────────────────────────────────────────────

  // 2026-06-28 — Bumped from 1200/0.85 default. INCI text is small;
  // better to keep resolution. The server now caps via Zod
  // photoBase64.max(10_000_000) so we're safe on the wire.
  const compressImage = useCallback(
    (dataUrl: string, maxDim = 1600, quality = 0.92): Promise<string> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const ctx = c.getContext("2d");
          if (!ctx) { reject(new Error("Canvas not supported")); return; }
          ctx.drawImage(img, 0, 0, w, h);
          // Quality 0.92 keeps small INCI text legible after JPEG compression.
          resolve(c.toDataURL("image/jpeg", quality).split(",")[1]);
        };
        img.onerror = () => reject(new Error("Ошибка загрузки изображения"));
        img.src = dataUrl;
      }),
    [],
  );

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1080 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setShowCamera(true);
      setPhoto(null);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch {
      // Camera declined or unavailable — fall through to file picker
      fileRef.current?.click();
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("ctx missing");
      ctx.drawImage(v, 0, 0);
      stopCamera();
      // 2026-06-28 — store jpeg@0.85 base64 directly; UI re-upload
      // sends it as-is. Avoids the prior double-compress bug
      // (compress → upload → server compress again).
      setPhoto(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    } catch {
      setError("Не удалось сделать снимок. Попробуй выбрать из галереи.");
    }
  }, [stopCamera]);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          // 2026-06-28 — gallery file may be huge; compress before send.
          const compressed = await compressImage(reader.result as string, 1600, 0.9);
          setPhoto(compressed);
          setHint("Фото готово к распознаванию");
        } catch (err: any) {
          console.warn("[AddProductModal] gallery compress failed:", err);
          setError("Не удалось обработать файл");
        }
      };
      reader.readAsDataURL(file);
    },
    [compressImage],
  );

  const uploadPhoto = useCallback(
    async (base64: string) => {
      setLoading(true);
      setError(""); setHint("");
      try {
        await api.inventory.add({ source: "photo", imageBase64: base64 });
        onSuccess();
        reset();
        onClose();
      } catch {
        setError("ИИ не смог прочитать текст. Сфотографируй ровнее или введи вручную.");
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onClose, reset],
  );

  const retakePhoto = useCallback(() => {
    setPhoto(null);
    setHint("");
    startCamera();
  }, [startCamera]);

  const confirmPhoto = useCallback(async () => {
    if (!photo) return;
    await uploadPhoto(photo);
  }, [photo, uploadPhoto]);

  // ── Barcode helpers ────────────────────────────────────────────

  // 2026-06-28 — Initialize detector once on mount to keep format-set
  // construction costs off the camera-start critical path.
  useEffect(() => {
    detectorRef.current = getBarcodeDetector();
    if (!detectorRef.current) setBarcodeSupported(false);
  }, []);

  const handleBarcodeFound = useCallback(
    async (code: string) => {
      // Lock immediately to prevent duplicate `handleBarcodeFound`
      // invocations (camera fires one detect() per RAF tick).
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopScanner();
      setLoading(true);
      setError(""); setHint("");

      try {
        const product = await fetchProductByBarcode(code);

        if (product && (product.name || product.ingredients)) {
          // OBF hit — auto-save so the user doesn't have to tap again.
          // Server checks cache first; if our scanned code already exists
          // in any user's items it dedups via findFirst(sourceUrl=…).
          await api.inventory.add({
            source: "barcode",
            sourceUrl: code,
            name: product.name || undefined,
            brand: product.brand || undefined,
            ingredients: product.ingredients || undefined,
          });
          onSuccess();
          reset();
          onClose();
          return;
        }

        // OBF miss / network error / no useful data.
        // Switch to manual step with the code preserved, so server
        // doesn't get a meaningless barcode_save attempt that would
        // throw barcode_not_found.
        setPendingBarcode(code);
        setHint(`Штрих-код ${code} — допиши данные вручную`);
        setStep("manual");
      } catch (err: any) {
        // 2026-06-28 — log with tag for Vercel debugging
        console.warn("[AddProductModal] barcode flow failed:", err?.message ?? err);
        setPendingBarcode(code);
        setError(`Штрих-код: ${code}. Не удалось распознать автоматически — введи данные вручную.`);
        setStep("manual");
      } finally {
        setLoading(false);
      }
    },
    [stopScanner, onSuccess, reset, onClose],
  );

  // Detect loop. Uses RAF refs for `foundRef` and `scanStreamRef` —
  // these are mutated synchronously, so the closure sees up-to-date
  // state without depending on React render cycles.
  const runDetectionLoop = useCallback(() => {
    const tick = async () => {
      const video = scanVideoRef.current;
      const detector = detectorRef.current;
      const stream = scanStreamRef.current;
      if (!video || !detector || !stream) return;

      try {
        const codes = await detector.detect(video);
        // Filter to cosmetic-relevant formats only (config already does this,
        // but some browsers return extra props for malformed QR codes).
        if (codes.length > 0 && codes[0].rawValue) {
          // Vibrate for haptic feedback on supported devices (Telegram WebView on Android).
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try { navigator.vibrate?.(200); } catch {}
          }
          await handleBarcodeFound(codes[0].rawValue);
          return;
        }
      } catch {
        // Per-frame errors (e.g., video not ready) — RAF will retry.
      }
      // Re-arm only if scanner still alive (stopScanner clears the stream ref).
      if (scanStreamRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [handleBarcodeFound]);

  const startScanner = useCallback(async () => {
    setError(""); setFoundProduct(null);
    setHint("Наведи камеру на штрих-код");

    if (!detectorRef.current) {
      setBarcodeSupported(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      scanStreamRef.current = stream;
      setScanning(true);
      // small mount delay so <video> is in DOM
      await new Promise((r) => setTimeout(r, 200));
      const video = scanVideoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {/* autoplay blocked — loop won't start, error path covered */});
      }
      runDetectionLoop();
    } catch (err: any) {
      console.warn("[AddProductModal] getUserMedia failed:", err?.message ?? err);
      setError("Камера недоступна. Введи штрих-код вручную ниже.");
      setBarcodeSupported(false);
      setScanning(false);
    }
  }, [runDetectionLoop]);

  // Manual barcode submission path (when BarcodeDetector unsupported
  // OR user prefers to type). Same server path as camera scan — the
  // /api endpoint is the source of truth.
  const submitManualBarcode = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(""); setHint("");
      try {
        // Pre-fill with client-side OBF so we don't roundtrip twice.
        const product = await fetchProductByBarcode(code);
        if (product && (product.name || product.ingredients)) {
          await api.inventory.add({
            source: "barcode",
            sourceUrl: code,
            name: product.name || undefined,
            brand: product.brand || undefined,
            ingredients: product.ingredients || undefined,
          });
          onSuccess();
          reset();
          onClose();
          return;
        }
        // OBF returned null. Switch to manual entry — the user will
        // supply data. Don't save the bare barcode (server would throw
        // barcode_not_found → pointless 500).
        setPendingBarcode(code);
        setHint(`Штрих-код ${code}. Введи название и состав вручную.`);
        setStep("manual");
      } catch (err: any) {
        console.warn("[AddProductModal] manual barcode lookup failed:", err?.message ?? err);
        setError("Не удалось проверить штрих-код. Попробуй ещё раз.");
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, reset, onClose],
  );

  // ── Manual submit (shared with photo + barcode fallback) ───────

  const handleManualSubmit = useCallback(async () => {
    setError("");
    if (!name.trim()) { setError("Введи название средства"); return; }
    setLoading(true);
    try {
      await api.inventory.add({
        source: pendingBarcode ? "barcode" : "manual",
        sourceUrl: pendingBarcode || undefined,
        name: name.trim(),
        brand: brand.trim() || undefined,
        ingredients: ingredients.trim() || undefined,
      });
      onSuccess();
      reset();
      onClose();
    } catch {
      setError("Ошибка при добавлении. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [name, brand, ingredients, pendingBarcode, onSuccess, reset, onClose]);

  // ── UI helpers ─────────────────────────────────────────────────

  const btnPrimary = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: "100%",
    padding: "16px",
    borderRadius: 16,
    background: "linear-gradient(135deg, var(--primary), var(--secondary))",
    color: "white",
    fontSize: 15,
    fontWeight: 600,
    border: "none",
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.7 : 1,
    ...extra,
  });

  const btnSecondary = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: "100%",
    padding: "16px",
    borderRadius: 16,
    border: "2px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? "wait" : "pointer",
    ...extra,
  });

  const optionCardStyle: React.CSSProperties = {
    width: "100%",
    padding: "16px",
    borderRadius: 16,
    background: "var(--bg)",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 14,
    position: "relative",
  };

  const METHODS = [
    {
      key: "barcode" as Step,
      icon: "▦",
      title: "Штрих-код / QR",
      desc: "Наведи камеру — найдём состав в открытой базе косметики",
      badge: { label: "Быстрее", color: "var(--primary)" },
      highlighted: true,
    },
    {
      key: "photo" as Step,
      icon: "📷",
      title: "Фото состава",
      desc: "Сфотографируй INCI-состав — ИИ прочитает текст с упаковки",
      badge: { label: "", color: "" },
      highlighted: false,
    },
    {
      key: "manual" as Step,
      icon: "✏️",
      title: "Ввести вручную",
      desc: "Заполни название и состав самостоятельно",
      badge: { label: "", color: "" },
      highlighted: false,
    },
  ];

  // ── Header dynamic title ───────────────────────────────────────

  const headerTitle = (() => {
    if (step === "choose") return "Добавить средство";
    if (step === "barcode") return "Штрих-код";
    if (step === "photo") return "Фото состава";
    if (step === "manual") {
      if (pendingBarcode) return "Проверь данные";
      return "Вручную";
    }
    return "";
  })();

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
            zIndex: 200,
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
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            style={{
              background: "white",
              width: "100%",
              maxWidth: 430,
              borderRadius: "24px 24px 0 0",
              padding: "20px 20px 32px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              {step === "choose" ? (
                <span style={{ width: 24 }} />
              ) : (
                <button
                  onClick={() => {
                    setError(""); setHint(""); setPhoto(null);
                    setFoundProduct(null); setManualBarcode("");
                    setPendingBarcode(null);
                    stopCamera(); stopScanner();
                    setStep("choose");
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--text-muted)", padding: 0, lineHeight: 1 }}
                >
                  ←
                </button>
              )}
              <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{headerTitle}</h3>
              <button onClick={() => { onClose(); reset(); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <CloseIcon size={22} />
              </button>
            </div>

            {/* ── CHOOSE ── */}
            {step === "choose" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {METHODS.map((m) => (
                  <motion.button
                    key={m.key}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      if (m.key === "barcode") {
                        setStep("barcode");
                        // Auto-start camera if BarcodeDetector supported.
                        if (barcodeSupported) {
                          setTimeout(() => startScanner(), 100);
                        }
                      } else {
                        setStep(m.key);
                      }
                    }}
                    style={{
                      ...optionCardStyle,
                      border: m.highlighted ? "2px solid var(--primary)" : "1px solid var(--border)",
                    }}
                  >
                    {m.badge.label && (
                      <span style={{
                        position: "absolute",
                        top: -8, right: 12,
                        fontSize: 10, fontWeight: 700, padding: "3px 10px",
                        borderRadius: 10, background: "var(--primary)",
                        color: "white", letterSpacing: "0.3px",
                      }}>
                        {m.badge.label}
                      </span>
                    )}
                    <span style={{
                      fontSize: 26, lineHeight: 1, minWidth: 32, textAlign: "center",
                      color: m.highlighted ? "var(--primary)" : "var(--text)",
                    }}>
                      {m.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: "var(--text)" }}>
                        {m.title}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                        {m.desc}
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M9 5l7 7-7 7" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.button>
                ))}
              </div>
            )}

            {/* ── BARCODE ── */}
            {step === "barcode" && (
              <div>
                {/* Camera path */}
                {scanning && barcodeSupported && (
                  <div style={{ position: "relative" }}>
                    <video
                      ref={scanVideoRef}
                      autoPlay playsInline muted
                      style={{
                        width: "100%", borderRadius: 18,
                        aspectRatio: "4/3", objectFit: "cover", background: "#000",
                      }}
                    />
                    {/* Reticle + animated scan line */}
                    <div style={{
                      position: "absolute", inset: "12% 8%",
                      border: "2px solid var(--primary)",
                      borderRadius: 14,
                      pointerEvents: "none",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                      overflow: "hidden",
                    }}>
                      {/* Four-corner brackets */}
                      {[
                        { top: -2, left: -2, borderTop: "3px solid white", borderLeft: "3px solid white", borderTopLeftRadius: 12 },
                        { top: -2, right: -2, borderTop: "3px solid white", borderRight: "3px solid white", borderTopRightRadius: 12 },
                        { bottom: -2, left: -2, borderBottom: "3px solid white", borderLeft: "3px solid white", borderBottomLeftRadius: 12 },
                        { bottom: -2, right: -2, borderBottom: "3px solid white", borderRight: "3px solid white", borderBottomRightRadius: 12 },
                      ].map((s, i) => (
                        <span key={i} style={{ position: "absolute", width: 18, height: 18, ...s }} />
                      ))}
                      {/* Animated scan line */}
                      <div
                        className="animate-scan-line"
                        style={{
                          position: "absolute",
                          left: 8, right: 8,
                          height: 2,
                          background: "var(--primary)",
                          boxShadow: "0 0 8px rgba(232, 160, 180, 0.7)",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <button
                      onClick={stopScanner}
                      style={{
                        position: "absolute", bottom: 16, left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(255,255,255,0.95)",
                        border: "none", borderRadius: 20,
                        padding: "8px 22px",
                        fontSize: 13, fontWeight: 600,
                        cursor: "pointer", color: "var(--text)",
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                )}

                {/* Camera unavailable / manual fallback */}
                {!scanning && (
                  <div>
                    {!barcodeSupported && (
                      <div style={{
                        padding: "10px 14px", borderRadius: 12,
                        background: "var(--bg)", border: "1px solid var(--border)",
                        fontSize: 12, color: "var(--text-secondary)",
                        marginBottom: 14, lineHeight: 1.4,
                      }}>
                        📷 Камера-сканер недоступна в этом браузере. Введи штрих-код вручную — попробуем найти в базе косметики.
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                      Штрих-код (EAN-13 / UPC-A / QR)
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="например: 4601234567890"
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, "").slice(0, 14))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manualBarcode.length >= 8) {
                          submitManualBarcode(manualBarcode);
                        }
                      }}
                      style={{
                        width: "100%", padding: "14px 16px",
                        borderRadius: 14, border: "1px solid var(--border)",
                        fontSize: 14, background: "var(--bg)",
                        color: "var(--text)", marginBottom: 10,
                        letterSpacing: "0.5px", fontFamily: "ui-monospace, monospace",
                      }}
                    />
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => submitManualBarcode(manualBarcode)}
                      disabled={loading || manualBarcode.length < 8}
                      style={btnPrimary({ opacity: (loading || manualBarcode.length < 8) ? 0.5 : 1 })}
                    >
                      {loading ? "Ищем в базе..." : "Найти"}
                    </motion.button>

                    {/* Try again camera button (in case camera fails after first attempt) */}
                    {barcodeSupported && (
                      <button
                        onClick={startScanner}
                        style={{
                          marginTop: 12, fontSize: 13,
                          color: "var(--primary)", fontWeight: 600,
                          background: "none", border: "none",
                          cursor: "pointer", width: "100%",
                        }}
                      >
                        📷 Попробовать камеру
                      </button>
                    )}
                  </div>
                )}

                {/* Inline status / hint */}
                {hint && <div style={{
                  marginTop: 12, padding: "8px 12px", borderRadius: 10,
                  background: "var(--bg)", fontSize: 12,
                  color: "var(--text-secondary)", textAlign: "center",
                  borderLeft: "3px solid var(--primary)",
                }}>{hint}</div>}

                {loading && (
                  <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "var(--text-secondary)" }}>
                    Распознаём штрих-код...
                  </div>
                )}
              </div>
            )}

            {/* ── PHOTO ── */}
            {step === "photo" && !showCamera && !photo && (
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                  Держи камеру ровно, без бликов. Лучший результат — фото открытого состава на сайте бренда.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={startCamera}
                    style={btnPrimary({ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 })}
                  >
                    <CameraIcon size={24} />
                    <span>Камера</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => fileRef.current?.click()}
                    style={btnSecondary({ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 })}
                  >
                    <span style={{ fontSize: 22 }}>🖼️</span>
                    <span>Галерея</span>
                  </motion.button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
                {hint && <div style={{
                  marginTop: 12, padding: "8px 12px", borderRadius: 10,
                  background: "var(--bg)", fontSize: 12, color: "var(--text-secondary)",
                  textAlign: "center", borderLeft: "3px solid var(--primary)",
                }}>{hint}</div>}
                {loading && <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)", marginTop: 14 }}>Распознаём текст...</div>}
              </div>
            )}

            {step === "photo" && showCamera && (
              <div style={{ position: "relative" }}>
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  style={{ width: "100%", borderRadius: 16, aspectRatio: "3/4", objectFit: "cover", background: "#000" }}
                />
                <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 }}>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={stopCamera}
                    style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "rgba(255,255,255,0.9)", border: "none",
                      cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 20,
                      color: "var(--text)",
                    }}
                  >
                    ✕
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={capturePhoto}
                    style={{
                      width: 64, height: 64, borderRadius: "50%",
                      background: "white", border: "4px solid var(--primary)",
                      cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center",
                    }}
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
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={retakePhoto}
                    style={btnSecondary()}
                  >
                    Переснять
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={confirmPhoto}
                    disabled={loading}
                    style={btnPrimary({ opacity: loading ? 0.7 : 1 })}
                  >
                    {loading ? "Распознаём..." : "Распознать ✨"}
                  </motion.button>
                </div>
              </div>
            )}

            {/* ── MANUAL ── */}
            {step === "manual" && (
              <div>
                {pendingBarcode && (
                  <div style={{
                    padding: "8px 14px", borderRadius: 12,
                    background: "var(--bg)", border: "1px solid var(--primary)",
                    marginBottom: 14, display: "flex",
                    alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 16 }}>▦</span>
                    <span style={{ fontSize: 12, color: "var(--primary-dark)", fontWeight: 500 }}>
                      Штрих-код: <span style={{ fontFamily: "ui-monospace, monospace" }}>{pendingBarcode}</span>
                    </span>
                  </div>
                )}

                {foundProduct && !pendingBarcode && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 12, marginBottom: 14,
                    background: "var(--bg)", border: "1px solid var(--primary)",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 18 }}>✅</span>
                    <span style={{ fontSize: 12, color: "var(--primary-dark)", fontWeight: 600 }}>
                      Нашли в базе! Проверь данные и сохрани
                    </span>
                  </div>
                )}

                <input
                  placeholder="Название средства *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%", padding: "14px 16px",
                    borderRadius: 14, border: "1px solid var(--border)",
                    fontSize: 14, marginBottom: 10, background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
                <input
                  placeholder="Бренд (необязательно)"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  style={{
                    width: "100%", padding: "14px 16px",
                    borderRadius: 14, border: "1px solid var(--border)",
                    fontSize: 14, marginBottom: 10, background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
                <textarea
                  placeholder="Состав — вставь INCI-список с упаковки"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  rows={5}
                  style={{
                    width: "100%", padding: "12px 16px",
                    borderRadius: 14, border: "1px solid var(--border)",
                    fontSize: 13, resize: "none",
                    marginBottom: 14, background: "var(--bg)",
                    color: "var(--text)", lineHeight: 1.5,
                  }}
                />

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleManualSubmit}
                  disabled={loading}
                  style={btnPrimary({ opacity: loading ? 0.7 : 1 })}
                >
                  {loading ? "Добавляем..." : "Добавить средство"}
                </motion.button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                marginTop: 14, padding: "10px 14px",
                borderRadius: 12, background: "rgba(232, 160, 180, 0.1)",
                fontSize: 13, color: "#E07A8E",
                textAlign: "center", lineHeight: 1.4,
              }}>
                {error}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
