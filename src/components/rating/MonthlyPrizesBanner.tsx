"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * localStorage key for the collapsed-state preference. Versioned so
 * future copy/prize-shape changes can default to "show me again" by
 * bumping the suffix without crashing on stale values.
 */
const STORAGE_KEY = "mplb_collapsed_v1";

/**
 * 2026-06-28 — Static info-card explaining the monthly Top-1 prize.
 * Rendered above the leaderboard sub-tabs on /rating. Self-contained
 * (no client queries needed) so it loads even when the leaderboard
 * itself is still fetching and there are zero rows in the ranking.
 *
 * Prize source-of-truth: `lib/pricing.ts` → pack5 = 5 analyses at
 * 399 ₽ / 280 ⭐. We hard-code the count here intentionally: this
 * banner copy is the user-facing promise, and the payout grant also
 * hardcodes `PAYOUT_ANALYSES = 5` in `monthlyWinnerService.ts`. If
 * the prize changes, update BOTH together.
 *
 * 2026-06-29 — Collapsible: the header line ("Топ-1 рейтинга
 * рефералов получает 5 анализов в подарок") stays always visible as a
 * one-liner, the rest (copy + 5-square prize ribbon + footer caption)
 * folds/unfolds via a chevron button in the top-right corner. Default
 * = expanded so the prize mechanics are immediately readable; users
 * collapse it once they have seen it. Body animates with framer-motion
 * `height: auto` so the layout below reflows smoothly.
 *
 * 2026-06-29 (later) — Collapse state persists in localStorage under
 * "mplb_collapsed_v1" so repeat visitors don't get re-introduced to
 * the prize copy on every /rating visit. Newly registered users see
 * the expanded copy once, then collapse/expand follows their tap.
 * Reads lazily inside useState so the SSR/initial-mount cost is one
 * synchronous getItem call; writes happen on toggle inside the
 * functional setter so a rapid double-click stays consistent.
 */
export const MonthlyPrizesBanner: React.FC = () => {
  // State baseline deliberately matches what the server renders (and
  // therefore what the first client paint produces): expanded. A lazy
  // useState initializer would diverge between SSR (no `window`,
  // returns true) and client (reads localStorage, may return false) →
  // React hydration mismatch in dev and silent re-paint in prod. We
  // keep the initializer pure and apply the persisted preference in
  // a mount-time useEffect. Trade: a returning visitor who previously
  // collapsed sees ~one frame of expanded before the body folds —
  // acceptable cost for hydration correctness.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    // Stored-value semantics (v1):
    //   "1" = banner is currently collapsed (user dismissed payoff
    //         copy on a prior visit).
    //   "0" = banner is expanded (default for new visitors; also
    //         written when the user toggles back open after collapsing).
    // The `v1` suffix leaves room to reset-on-format-change by bumping
    // to v2 in the future without crashing on stale values.
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setExpanded(false);
    } catch {
      // localStorage can throw in Safari private mode, in some
      // embedded Telegram webview configurations, or on quota errors.
      // Leaving the default expanded state in that case is fine —
      // UX degrades to "shows the banner every visit", not a crash.
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background:
          "linear-gradient(135deg, rgba(255, 215, 0, 0.10) 0%, rgba(126, 196, 216, 0.08) 100%)",
        border: "1px solid rgba(255, 215, 0, 0.25)",
        borderRadius: 16,
        padding: "12px 14px",
        marginBottom: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Декоративный «козырёк» сверху, чтобы баннер читался как
          особый блок, а не как часть общего потока карточек. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -22,
          right: -22,
          width: 78,
          height: 78,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255, 215, 0, 0.22) 0%, rgba(255, 215, 0, 0) 70%)",
          pointerEvents: "none",
        }}
      />

      <button
        type="button"
        onClick={() =>
          setExpanded((prev) => {
            const next = !prev;
            // Persist the preference. Performed inside the functional
            // setter so the stored value matches the new state — a
            // double-click (two rapid toggles) writes the final state
            // twice, with both writes equivalent under the "0"/"1"
            // mapping documented above (no race, no stale read).
            try {
              window.localStorage.setItem(STORAGE_KEY, next ? "0" : "1");
            } catch {
              // Toggle still works visually; persistence is best-effort
              // and won't crash on private-mode embeds / quota errors.
            }
            return next;
          })
        }
        aria-expanded={expanded}
        aria-label={expanded ? "Свернуть информацию о призах" : "Развернуть информацию о призах"}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "transparent",
          border: "none",
          padding: 2,
          margin: 0,
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 26,
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-hidden
          >
            🏆
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.3,
            }}
          >
            Топ-1 рейтинга рефералов получает 5&nbsp;анализов в&nbsp;подарок
          </div>
        </div>

        {/* Chevron toggle. SR-only-ish aria handled by the parent
            <button>; visually a small rounded chip that rotates 180°
            between expanded and collapsed. */}
        <motion.span
          aria-hidden
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: 13,
            background: "rgba(255, 215, 0, 0.18)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#B8860B",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.2, ease: "easeOut" },
            }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.55,
                position: "relative",
                paddingTop: 8,
              }}
            >
              Каждое 1-е число месяца вручаем{" "}
              <span style={{ fontWeight: 600 }}>pack&nbsp;5 анализов</span>{" "}
              (≈ 399&nbsp;₽ / 280&nbsp;⭐) пользователю, который привёл больше
              всего друзей в уходящем месяце.
              <br />
              Чем больше активных рефералов ты пригласишь — тем выше шансы
              забрать приз 👇
            </div>

            {/* Тонкая «progress-bar»-метафора: визуальный якорь, чтобы
                число анализов запоминалось, а не терялось в потоке копирайта.
                5 квадратиков — 5 анализов, в живой версии можно будет
                закрашивать по «заработанным» анализам в следующих итерациях. */}
            <div
              aria-hidden
              style={{
                display: "flex",
                gap: 4,
                marginTop: 10,
              }}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background:
                      "linear-gradient(90deg, #FFD700 0%, #FFA500 100%)",
                    boxShadow: "0 1px 2px rgba(255, 165, 0, 0.25)",
                  }}
                />
              ))}
            </div>

            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 6,
                fontStyle: "italic",
              }}
            >
              Призы вручаются автоматически 1-го числа каждого месяца в 04:00 МСК.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
