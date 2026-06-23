"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type InventoryItem } from "@/services/api";
import { AddProductModal } from "./AddProductModal";
import { EditProductModal } from "./EditProductModal";
import { CardSkeleton } from "@/components/ui/Skeleton";

const SAFETY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  safe: { bg: "rgba(168, 216, 234, 0.15)", text: "#7EC4D8", label: "Безопасно" },
  caution: { bg: "rgba(255, 180, 162, 0.15)", text: "#E89B87", label: "С осторожностью" },
  irritant: { bg: "rgba(232, 160, 180, 0.15)", text: "#E07A8E", label: "Раздражитель" },
};

export const InventoryPanel: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const load = () => {
    setLoading(true);
    api.inventory.list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    await api.inventory.remove({ id });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const count = items.length;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        style={{ marginBottom: 12, overflow: "hidden", padding: 0 }}
      >
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
            border: "none", background: "transparent", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 20 }}>🧴</span>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Мой инвентарь</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {count > 0 ? `${count} ${count === 1 ? "средство" : count < 5 ? "средства" : "средств"}` : "Добавьте средства ухода"}
            </div>
          </div>
          <motion.svg animate={{ rotate: open ? 180 : 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M6 9l6 6 6-6" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </motion.svg>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ padding: "0 16px 16px" }}>
                <button
                  onClick={() => setAddOpen(true)}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 14,
                    border: "2px dashed var(--border)", background: "var(--bg)",
                    cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)",
                    marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <span>+</span> Добавить средство
                </button>

                {loading ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}
                  </div>
                ) : items.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px", fontSize: 13, color: "var(--text-muted)" }}>
                    Пока нет средств. Добавьте через ссылку, фото состава или вручную.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((item) => {
                      const safety = item.analysis?.safety_rating;
                      const sc = SAFETY_COLORS[safety || "caution"] || SAFETY_COLORS.caution;
                      const isExpanded = expanded === item.id;
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{
                            padding: "12px 14px", borderRadius: 14, background: "var(--bg)",
                            border: sc ? `1px solid ${sc.bg}` : "none",
                          }}
                        >
                          <div
                            onClick={() => setExpanded(isExpanded ? null : item.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{item.name}</span>
                              {item.brand && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.brand}</span>}
                            </div>
                            <div className="flex gap-2">
                              {sc && (
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: sc.bg, color: sc.text, fontWeight: 600 }}>
                                  {sc.label}
                                </span>
                              )}
                              <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 0" }}>
                                {new Date(item.createdAt).toLocaleDateString("ru-RU")}
                              </span>
                            </div>
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                style={{ overflow: "hidden" }}
                              >
                                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                                  {item.analysis && (
                                    <div className="flex flex-col gap-2">
                                      <div>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>Ключевые ингредиенты</div>
                                        <div className="flex gap-1 flex-wrap">
                                          {item.analysis.key_ingredients.map((k, i) => (
                                            <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--primary-light)", color: "var(--primary-dark)" }}>{k}</span>
                                          ))}
                                        </div>
                                      </div>
                                      {item.analysis.benefits.length > 0 && (
                                        <div>
                                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>Польза</div>
                                          {item.analysis.benefits.map((b, i) => (
                                            <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", paddingLeft: 12 }}>• {b}</div>
                                          ))}
                                        </div>
                                      )}
                                      {item.analysis.concerns.length > 0 && (
                                        <div>
                                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>⚠ Возможные проблемы</div>
                                          {item.analysis.concerns.map((c, i) => (
                                            <div key={i} style={{ fontSize: 12, color: "#E07A8E", paddingLeft: 12 }}>• {c}</div>
                                          ))}
                                        </div>
                                      )}
                                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{item.analysis.suitability}</div>
                                    </div>
                                  )}

                                  {item.ingredients && (
                                    <details style={{ marginTop: 8 }}>
                                      <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>Состав</summary>
                                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5, wordBreak: "break-all" }}>{item.ingredients}</div>
                                    </details>
                                  )}

                                  <div className="flex gap-3" style={{ marginTop: 8 }}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingItem(item); }}
                                      style={{ fontSize: 11, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                                    >
                                      Редактировать
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                      style={{ fontSize: 11, color: "#E07A8E", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AddProductModal open={addOpen} onClose={() => setAddOpen(false)} onSuccess={load} />
      <EditProductModal open={!!editingItem} item={editingItem} onClose={() => setEditingItem(null)} onSuccess={load} />
    </>
  );
};
