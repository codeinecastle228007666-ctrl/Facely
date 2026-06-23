"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import { api, type InventoryItem } from "@/services/api";

interface EditProductModalProps {
  open: boolean;
  item: InventoryItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({ open, item, onClose, onSuccess }) => {
  const [name, setName] = useState(item?.name || "");
  const [brand, setBrand] = useState(item?.brand || "");
  const [ingredients, setIngredients] = useState(item?.ingredients || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (item) {
      setName(item.name);
      setBrand(item.brand || "");
      setIngredients(item.ingredients || "");
    }
  }, [item]);

  const handleSubmit = async () => {
    if (!item) return;
    setError("");
    if (!name.trim()) { setError("Введите название средства"); return; }
    setLoading(true);
    try {
      await api.inventory.update({
        id: item.id,
        name: name.trim(),
        brand: brand.trim() || undefined,
        ingredients: ingredients.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch { setError("Ошибка при сохранении"); }
    finally { setLoading(false); }
  };

  return (
    <AnimatePresence>
      {open && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 210, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={onClose}
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
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Редактировать</h3>
              <button onClick={onClose}><CloseIcon size={22} /></button>
            </div>

            <input placeholder="Название средства *" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
            <input placeholder="Бренд (необязательно)" value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 14, marginBottom: 10, background: "var(--bg)" }} />
            <textarea placeholder="Состав (INCI)" value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={4} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: "1px solid var(--border)", fontSize: 13, resize: "none", marginBottom: 12, background: "var(--bg)" }} />

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Сохранение..." : "Сохранить"}
            </motion.button>

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
