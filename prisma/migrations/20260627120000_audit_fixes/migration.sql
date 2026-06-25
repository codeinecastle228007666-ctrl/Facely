-- ════════════════════════════════════════════════════════════════════════════
-- Audit fixes migration (2026-06-27)
-- Adds:
--   1. User.lastPhotoHash \u2014 O(1) photo dedup (M4)
--   2. ProcessedInvoice \u2014 webhook idempotency, prevents double-credit (M2)
--   3. CardTransferClaim \u2014 1-hour claim dedup, prevents spam (M6)
--   4. achievements hydration_master + consistent_care (Q5 from prior round)
--
-- Idempotent: safe to re-run. Each statement uses IF NOT EXISTS / DO BEGIN.
-- In Supabase SQL Editor: paste + Run once.
-- Locally: `npx prisma migrate deploy`
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. User.lastPhotoHash ───────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastPhotoHash" TEXT;
CREATE INDEX IF NOT EXISTS "User_lastPhotoHash_idx" ON "User"("lastPhotoHash");

-- ─── 2. ProcessedInvoice (idempotency guard) ───────────────────────────
CREATE TABLE IF NOT EXISTS "ProcessedInvoice" (
    "id"          TEXT NOT NULL,
    "payload"     TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "amount"      INTEGER NOT NULL,
    "currency"    TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcessedInvoice_payload_key" ON "ProcessedInvoice"("payload");
CREATE INDEX IF NOT EXISTS "ProcessedInvoice_userId_idx" ON "ProcessedInvoice"("userId");
CREATE INDEX IF NOT EXISTS "ProcessedInvoice_processedAt_idx" ON "ProcessedInvoice"("processedAt");

-- FK only if not already present
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessedInvoice_userId_fkey') THEN
        ALTER TABLE "ProcessedInvoice"
            ADD CONSTRAINT "ProcessedInvoice_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 3. CardTransferClaim (spam protection) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "CardTransferClaim" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tier"      TEXT NOT NULL,
    "amount"    INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardTransferClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CardTransferClaim_userId_tier_claimedAt_idx"
    ON "CardTransferClaim"("userId", "tier", "claimedAt");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CardTransferClaim_userId_fkey') THEN
        ALTER TABLE "CardTransferClaim"
            ADD CONSTRAINT "CardTransferClaim_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 4. Seed new achievements (Q5 \u2014 hydration_master + consistent_care) ───
INSERT INTO "Achievement" ("id", "key", "title", "description", "icon", "xpReward") VALUES
    ('ach_hydration_master', 'hydration_master',
     'Повелитель влаги',
     'Сделай 75 анализов кожи \u2014 AI научится узнавать тебя точнее и подбирать уход под твой тип',
     '\ud83d\udca7', 25),
    ('ach_consistent_care', 'consistent_care',
     'Дисциплинированный уход',
     'Удерживай регулярный анализ 5 дней подряд',
     '\ud83d\udd25', 15)
ON CONFLICT ("key") DO UPDATE
    SET "title" = EXCLUDED."title",
        "description" = EXCLUDED."description",
        "icon" = EXCLUDED."icon",
        "xpReward" = EXCLUDED."xpReward";
