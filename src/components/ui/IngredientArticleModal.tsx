"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloseIcon } from "@/components/ui/Icons";
import { findArticle } from "@/data/ingredientArticles";

interface IngredientArticleModalProps {
  /**
   * Active article slug returned by `findArticleSlug()` on the parent
   * component's recommendation text. `null` keeps the modal closed.
   * We pass the slug rather than the resolved article so each
   * open() reads the freshest article registry (useful for hot
   * reload during development).
   */
  slug: string | null;
  onClose: () => void;
}

/**
 * 2026-07-01 — Clickable-recommendations article modal.
 *
 * Renders the bottom-sheet pattern shared with `ResultModal` and
 * other modals in the codebase: backdrop fade + slide-up sheet at
 * z-index 300 (above the inline content, below the toast layer at
 * z-index 500). Three sibling sections:
 *   • Что это — definition (always present).
 *   • Что делает с кожей — benefit list joined with "; " separator.
 *   • Как применять — practical instructions.
 *
 * Header carries the article title + close icon. The modal returns
 * `null` for both `slug === null` and unknown slug (defensive — the
 * URL could be stale from a hot-reload after registry change).
 */
export const IngredientArticleModal: React.FC<IngredientArticleModalProps> = ({
  slug,
  onClose,
}) => {
  const article = slug ? findArticle(slug) : null;

  return (
    <AnimatePresence>
      {slug && article && (
        <motion.div
          key="article-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 320,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={onClose}
        >
          <motion.div
            key="article-sheet"
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
              maxHeight: "85vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex justify-between items-center"
              style={{ marginBottom: 16 }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                {article.title}
              </h3>
              <button onClick={onClose} aria-label="Закрыть">
                <CloseIcon size={22} />
              </button>
            </div>

            <ArticleSection label="Что это" body={article.whatIs} />
            <ArticleSection
              label="Что делает с кожей"
              body={article.whatDoes}
            />
            <ArticleSection
              label="Как применять"
              body={article.howToApply}
              last
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const ArticleSection: React.FC<{
  label: string;
  body: string;
  last?: boolean;
}> = ({ label, body, last }) => (
  <div
    style={{
      padding: "12px 14px",
      borderRadius: 12,
      background: "rgba(232, 160, 180, 0.06)",
      marginBottom: last ? 0 : 12,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--primary-dark)",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
      }}
    >
      {body}
    </div>
  </div>
);
