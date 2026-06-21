"use client";

import React, { useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { AnalysisCard } from "@/components/history/AnalysisCard";
import { api, type AnalysisHistoryItem } from "@/services/api";
import { HistoryIcon } from "@/components/ui/Icons";
import { motion } from "framer-motion";

export default function HistoryPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.analysis
      .history({ limit: 50, offset: 0 })
      .then((data) => {
        setItems(data.analyses);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          style={{ marginBottom: 16 }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "rgba(232, 160, 180, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HistoryIcon size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>История анализов</h1>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Всего: {total}
            </span>
          </div>
        </motion.div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "3px solid var(--border)",
                borderTopColor: "var(--primary)",
                animation: "spin 0.7s linear infinite",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card flex flex-col items-center"
            style={{ padding: "48px 20px", gap: 12 }}
          >
            <HistoryIcon size={48} />
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              У вас пока нет анализов
            </p>
          </motion.div>
        ) : (
          <div>
            {items.map((item, i) => (
              <AnalysisCard key={item.id} item={item} index={i} />
            ))}
          </div>
        )}
      </div>

      <TabBar />
    </>
  );
}
