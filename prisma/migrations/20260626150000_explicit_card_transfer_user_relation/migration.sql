-- ╭──────────────────────────────────────────────────────────────────╮
-- │ 2026-06-26 — Explicit CardTransferClaim → User FK                │
-- ╰──────────────────────────────────────────────────────────────────╯
--
-- Why this migration exists: `scripts/credit-by-ref.ts` uses
-- `prisma.cardTransferClaim.findMany({ include: { user: ... } })`.
-- Prisma's TypeScript layer rejects `include.user` when the schema
-- has no explicit @relation — expressing the model as
-- `Type 'never'` and breaking `next build` on CI.
--
-- Schema is now updated to express the relation
-- (User.cardTransferClaims + CardTransferClaim.user @relation),
-- so this migration brings the live DB into agreement by adding
-- the actual foreign-key constraint. Existing rows are unaffected
-- because every CardTransferClaim inserts with a valid `userId`
-- (authService.findOrCreate always resolves a User row first).
--
-- Wrapped in DO $$ ... $$ so re-runs are idempotent (the previous
-- version of this DB schema was created without an explicit @relation
-- in prisma, so the FK constraint was never generated; this migration
-- is the first time we declare it).

DO $$
BEGIN
  BEGIN
    ALTER TABLE "CardTransferClaim"
      ADD CONSTRAINT "CardTransferClaim_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
    RAISE NOTICE 'Created CardTransferClaim_userId_fkey constraint';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'CardTransferClaim_userId_fkey already exists — skipping';
  END;
END
$$;

-- Optional coverage index — speeds up the back-relation queries that
-- the new schema relation unlocks (e.g. User.cardTransferClaims
-- reverse lookup from /admin panel).
CREATE INDEX IF NOT EXISTS "CardTransferClaim_userId_idx"
  ON "CardTransferClaim"("userId");
