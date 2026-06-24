"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type RoutineStepItem, type InventoryItem } from "@/services/api";

export const RoutineSection: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [steps, setSteps] = useState<RoutineStepItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newStep, setNewStep] = useState<{
    productName: string; inventoryId?: string; timeOfDay: "morning" | "evening"; dayOfWeek?: number | null;
  }>({ productName: "", timeOfDay: "morning" });

  const load = useCallback(async () => {
    const r = await api.routine.get();
    setSteps(r?.steps ?? []);
    const inv = await api.inventory.list();
    setInventory(inv);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addStep = () => {
    if (!newStep.productName.trim()) return;
    const inv = inventory.find((i) => i.id === newStep.inventoryId);
    setSteps((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}`,
        inventoryId: newStep.inventoryId || null,
        productName: newStep.productName,
        timeOfDay: newStep.timeOfDay,
        dayOfWeek: newStep.dayOfWeek ?? null,
        stepOrder: prev.length,
        inventory: inv ? { name: inv.name, brand: inv.brand } : null,
      },
    ]);
    setNewStep({ productName: "", timeOfDay: "morning" });
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const save = async () => {
    await api.routine.save({
      steps: steps.map((s, i) => ({
        inventoryId: s.inventoryId || undefined,
        productName: s.productName,
        timeOfDay: s.timeOfDay,
        dayOfWeek: s.dayOfWeek,
        stepOrder: i,
      })),
    });
    setEditing(false);
  };

  const morningSteps = steps.filter((s) => s.timeOfDay === "morning");
  const eveningSteps = steps.filter((s) => s.timeOfDay === "evening");

  return (
    <div style={{ marginBottom: 12 }}>
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="card"
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(168, 216, 234, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
          🗓️
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Рутина ухода</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {steps.length > 0 ? `${steps.length} ${steps.length === 1 ? "шаг" : steps.length < 5 ? "шага" : "шагов"}` : "Не настроена"}
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: "hidden" }}
          >
            <div className="card" style={{ marginTop: 8, padding: "14px 16px" }}>
              {!editing && steps.length === 0 && (
                <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "var(--text-muted)" }}>
                  Добавьте средства для ухода и назначьте их на утро/вечер
                </div>
              )}

              {!editing && steps.length > 0 && (
                <>
                  {morningSteps.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--primary-dark)", marginBottom: 6 }}>☀️ Утро</div>
                      {morningSteps.map((s, i) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 4, borderRadius: 12, background: "var(--bg)" }}>
                          <span style={{ width: 20, height: 20, borderRadius: 8, background: "var(--primary-light)", color: "var(--primary-dark)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                          <span style={{ fontSize: 13, flex: 1 }}>{s.productName}</span>
                          {s.inventory?.brand && <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{s.inventory.brand}</span>}
                          {s.dayOfWeek !== null && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "var(--primary-light)", color: "var(--primary-dark)" }}>{["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][s.dayOfWeek]}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {eveningSteps.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--primary-dark)", marginBottom: 6 }}>🌙 Вечер</div>
                      {eveningSteps.map((s, i) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 4, borderRadius: 12, background: "var(--bg)" }}>
                          <span style={{ width: 20, height: 20, borderRadius: 8, background: "var(--primary-light)", color: "var(--primary-dark)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                          <span style={{ fontSize: 13, flex: 1 }}>{s.productName}</span>
                          {s.inventory?.brand && <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{s.inventory.brand}</span>}
                          {s.dayOfWeek !== null && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "var(--primary-light)", color: "var(--primary-dark)" }}>{["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][s.dayOfWeek]}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {editing && (
                <div>
                  <div style={{ background: "var(--bg)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        {["morning", "evening"].map((t) => (
                          <button
                            key={t}
                            onClick={() => setNewStep((p) => ({ ...p, timeOfDay: t as "morning" | "evening" }))}
                            style={{
                              flex: 1, padding: "8px 0", borderRadius: 10, border: "none",
                              background: newStep.timeOfDay === t ? "var(--primary-light)" : "white",
                              color: newStep.timeOfDay === t ? "var(--primary-dark)" : "var(--text-muted)",
                              fontSize: 13, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            {t === "morning" ? "☀️ Утро" : "🌙 Вечер"}
                          </button>
                        ))}
                      </div>
                      {inventory.length > 0 && (
                        <select
                          value={newStep.inventoryId || ""}
                          onChange={(e) => {
                            const inv = inventory.find((i) => i.id === e.target.value);
                            setNewStep((p) => ({ ...p, inventoryId: e.target.value || undefined, productName: inv?.name || "" }));
                          }}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", marginBottom: 8 }}
                        >
                          <option value="">Выбрать из инвентаря...</option>
                          {inventory.map((i) => (
                            <option key={i.id} value={i.id}>{i.name}{i.brand ? ` (${i.brand})` : ""}</option>
                          ))}
                        </select>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          placeholder={inventory.length > 0 ? "Или введите название" : "Название средства"}
                          value={newStep.productName}
                          onChange={(e) => {
                            setNewStep((p) => ({ ...p, productName: e.target.value }));
                            if (e.target.value && newStep.inventoryId) {
                              setNewStep((p) => ({ ...p, inventoryId: undefined }));
                            }
                          }}
                          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white" }}
                        />
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={addStep}
                          disabled={!newStep.productName.trim()}
                          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: newStep.productName.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
                        >
                          + Добавить
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {steps.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      {(["morning", "evening"] as const).map((tod) => {
                        const group = steps.filter((s) => s.timeOfDay === tod);
                        if (group.length === 0) return null;
                        return (
                          <div key={tod} style={{ marginBottom: group === morningSteps && eveningSteps.length > 0 ? 12 : 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--primary-dark)", marginBottom: 6 }}>
                              {tod === "morning" ? "☀️ Утро" : "🌙 Вечер"}
                            </div>
                            {group.map((s, i) => (
                              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 4, borderRadius: 12, background: "var(--bg)" }}>
                                <span style={{ width: 20, height: 20, borderRadius: 8, background: "var(--primary-light)", color: "var(--primary-dark)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {i + 1}
                                </span>
                                <span style={{ fontSize: 13, flex: 1 }}>{s.productName}</span>
                                {s.inventory?.brand && <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{s.inventory.brand}</span>}
                                <motion.button
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => removeStep(s.id)}
                                  style={{ width: 24, height: 24, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#E07A8E", background: "rgba(224, 122, 142, 0.1)", flexShrink: 0 }}
                                >
                                  ✕
                                </motion.button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {steps.length > 0 && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setEditing(false); load(); }}
                        style={{ flex: 1, padding: "12px", borderRadius: 14, border: "2px solid var(--border)", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}
                      >
                        Отмена
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={save}
                        style={{ flex: 1, padding: "12px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                      >
                        Сохранить
                      </motion.button>
                    </div>
                  )}

                  {steps.length === 0 && (
                    <div style={{ textAlign: "center", padding: "8px 0", fontSize: 12, color: "var(--text-muted)" }}>
                      Добавьте хотя бы один шаг
                    </div>
                  )}
                </div>
              )}

              {!editing && steps.length > 0 && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setEditing(true)}
                  style={{ width: "100%", marginTop: 12, padding: "10px", borderRadius: 12, border: "none", background: "var(--bg)", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}
                >
                  Редактировать
                </motion.button>
              )}

              {!editing && steps.length === 0 && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setEditing(true)}
                  style={{ width: "100%", marginTop: 8, padding: "12px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, var(--primary), var(--secondary))", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Настроить рутину
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
