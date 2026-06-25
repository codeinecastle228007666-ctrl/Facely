-- ═══════════════════════════════════════════════════════════
-- Бонусная система: UserBonus + бонус-колонки на User + 2 новые ачивки
-- Idempotent: безопасно прогнать несколько раз.
-- ═══════════════════════════════════════════════════════════

-- UserBonus: единая копилка бонусов + промо-купоны
CREATE TABLE IF NOT EXISTS "UserBonus" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "amount"      INTEGER NOT NULL DEFAULT 1,
    "remaining"   INTEGER NOT NULL DEFAULT 1,
    "sourceKey"   TEXT,
    "code"        TEXT,
    "discount"    INTEGER,
    "appliedTo"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"   TIMESTAMP(3),
    "usedAt"      TIMESTAMP(3),
    CONSTRAINT "UserBonus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBonus_code_key"
    ON "UserBonus"("code")
    WHERE "code" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "UserBonus_userId_idx"
    ON "UserBonus"("userId");

CREATE INDEX IF NOT EXISTS "UserBonus_userId_kind_idx"
    ON "UserBonus"("userId", "kind");

CREATE INDEX IF NOT EXISTS "UserBonus_expiresAt_idx"
    ON "UserBonus"("expiresAt")
    WHERE "usedAt" IS NULL AND "expiresAt" IS NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserBonus_userId_fkey'
    ) THEN
        ALTER TABLE "UserBonus"
            ADD CONSTRAINT "UserBonus_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;


-- User: streakFreezes, proTrialUntil, monthStreakBadge
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "streakFreezes"    INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "proTrialUntil"    TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "monthStreakBadge" BOOLEAN     NOT NULL DEFAULT false;


-- Achievement: две новые ачивки из Q5
INSERT INTO "Achievement" ("id", "key", "title", "description", "icon", "xpReward") VALUES
    ('ach_hydration_master', 'hydration_master', 'Повелитель влаги',        'Сделай 75 анализов кожи',   '💧', 25),
    ('ach_consistent_care',  'consistent_care',  'Дисциплинированный уход', 'Удерживай 5-дневный стрик', '🔥', 15)
ON CONFLICT ("key") DO NOTHING;
