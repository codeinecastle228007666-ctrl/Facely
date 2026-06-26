-- ╭──────────────────────────────────────────────────────────────────╮
-- │ 2026-06-26 — Admin audit log for /admin panel grants            │
-- ╰──────────────────────────────────────────────────────────────────╯
--
-- Holds a row per admin action (grant reward / compensation /
-- cancellation) so any "why does this user suddenly have +20
-- paidAnalyses" question can be traced. Until now admin operations
-- only logged to console — which lost the trail between deploys.
--
-- Single-advisor MVP: `adminTelegramId` is the literal "admin". When
-- multi-admin support is added later, change to a per-admin telegramId.

CREATE TABLE "AdminGrant" (
  "id"              TEXT NOT NULL,
  "adminTelegramId" TEXT NOT NULL,
  "targetUserId"    TEXT NOT NULL,
  "kind"            TEXT NOT NULL,
  "amount"          INTEGER NOT NULL,
  "reason"          TEXT,
  "details"         JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("id")
);

-- Listing grants by user: "show every reward this user received".
CREATE INDEX "AdminGrant_targetUserId_createdAt_idx"
  ON "AdminGrant"("targetUserId", "createdAt");

-- Listing most-recent grants globally (admin dashboard feed).
CREATE INDEX "AdminGrant_createdAt_idx"
  ON "AdminGrant"("createdAt");

-- FK -> User — restrict on delete (don't accidentally lose audit log
-- when user is removed); cascade update so cuid migration doesn't break.
ALTER TABLE "AdminGrant"
  ADD CONSTRAINT "AdminGrant_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
