-- 2026-06-26 — Phase 1 card-transfer receipt-tracking improvements.
-- Adds UNIQUE `expectedReference` short code (anti-double-credit + admin
-- matcher), optional `submittedReference` for user's bank-app cross-check,
-- base64 `screenshotBase64` (max ~1MB client-side enforced), and
-- `creditConfirmed` flag + timestamp for the admin credit flow.
--
-- Backfill: existing rows get a synthetic LEGACY-{id} reference so the
-- NOT NULL + UNIQUE constraints can be applied without dropping rows.

ALTER TABLE "CardTransferClaim" ADD COLUMN "expectedReference"   TEXT;
ALTER TABLE "CardTransferClaim" ADD COLUMN "submittedReference"  TEXT;
ALTER TABLE "CardTransferClaim" ADD COLUMN "screenshotBase64"    TEXT;
ALTER TABLE "CardTransferClaim" ADD COLUMN "creditConfirmed"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CardTransferClaim" ADD COLUMN "creditConfirmedAt"   TIMESTAMP(3);

UPDATE "CardTransferClaim"
SET "expectedReference" = 'LEGACY-' || "id"
WHERE "expectedReference" IS NULL;

ALTER TABLE "CardTransferClaim" ALTER COLUMN "expectedReference" SET NOT NULL;

CREATE UNIQUE INDEX "CardTransferClaim_expectedReference_key"
  ON "CardTransferClaim"("expectedReference");

CREATE INDEX "CardTransferClaim_creditConfirmed_claimedAt_idx"
  ON "CardTransferClaim"("creditConfirmed", "claimedAt");
