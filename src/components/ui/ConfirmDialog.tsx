"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ConfirmVariant = "default" | "danger";

interface ConfirmDialogProps {
  /** Whether dialog is visible. */
  open: boolean;
  /** Short headline (e.g. "Удалить историю чата?"). */
  title: string;
  /** Body text. May include line breaks — they are preserved. */
  message?: string;
  /** Optional numeric counter for emphasis (e.g. "12 сообщений"). */
  count?: number;
  /** Label for the destructive (right-side) button. */
  confirmText?: string;
  /** Label for the dismiss (left-side) button. */
  cancelText?: string;
  /** "danger" uses red gradient; "default" uses brand gradient. */
  variant?: ConfirmVariant;
  /** Disables buttons + shows loading shimmer while parent promise resolves. */
  loading?: boolean;
  /** Fired on user pressing the confirm button. */
  onConfirm: () => void;
  /** Fired on user pressing cancel, on backdrop tap, or on Esc. */
  onCancel: () => void;
}

/**
 * Centered confirmation modal with destructive-action styling.
 *
 * Why not use `window.confirm()`? It's blocking, ugly, doesn't match our
 * design system, can't go async, and offers no animation. This component
 * matches the existing modal pattern (spring slide + backdrop fade) used
 * by PurchaseModal, AchievementsModal, ResultModal.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     title="Удалить историю чата?"
 *     message="Действие нельзя отменить."
 *     count={messages.length}
 *     confirmText="Удалить"
 *     variant="danger"
 *     loading={clearing}
 *     onConfirm={handleClear}
 *     onCancel={() => setOpen(false)}
 *   />
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  count,
  confirmText = "Подтвердить",
  cancelText = "Отмена",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}) => {
  // Esc-to-cancel
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  const palette = variant === "danger"
    ? {
        gradient: "linear-gradient(135deg, #E07A8E, #C0506A)",
        hoverText: "#C0506A",
        icon: "🗑️",
        titleColor: "var(--text)",
      }
    : {
        gradient: "linear-gradient(135deg, var(--primary), var(--secondary))",
        hoverText: "var(--primary-dark)",
        icon: "❓",
        titleColor: "var(--text)",
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { if (!loading) onCancel(); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 4 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            style={{
              background: "white",
              borderRadius: 22,
              padding: "24px 22px 20px",
              maxWidth: 360,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 36,
                lineHeight: 1,
                marginBottom: 12,
              }}
              aria-hidden="true"
            >
              {palette.icon}
            </div>

            <h3
              id="confirm-dialog-title"
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: palette.titleColor,
                marginBottom: 8,
                lineHeight: 1.3,
              }}
            >
              {title}
            </h3>

            {typeof count === "number" && count > 0 && (
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: variant === "danger" ? "#C0506A" : "var(--primary-dark)",
                  marginBottom: 6,
                  letterSpacing: -0.5,
                }}
              >
                {count}
              </div>
            )}

            {message && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                  marginBottom: 18,
                  whiteSpace: "pre-line",
                }}
              >
                {message}
              </p>
            )}

            <div
              className="flex gap-2"
              style={{ marginTop: 4 }}
            >
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "13px 16px",
                  borderRadius: 13,
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "1px solid var(--border)",
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "13px 16px",
                  borderRadius: 13,
                  background: palette.gradient,
                  color: "white",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {loading && (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "white",
                      animation: "spin 0.8s linear infinite",
                    }}
                    aria-hidden="true"
                  />
                )}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
