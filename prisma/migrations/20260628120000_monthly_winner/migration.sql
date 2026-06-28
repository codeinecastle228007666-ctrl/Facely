-- 2026-06-28 — Monthly Top-1 winner ledger. Records system grants for the
-- monthly leaderboard. UNIQUE on (month, category) is the idempotency guard
-- for cron-job.org retries on /api/cron/grant-monthly-winner.
CREATE TABLE "MonthlyWinner" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payout" INTEGER NOT NULL,
    "metricValue" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyWinner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyWinner_month_category_key" ON "MonthlyWinner"("month", "category");
CREATE INDEX "MonthlyWinner_userId_grantedAt_idx" ON "MonthlyWinner"("userId", "grantedAt");

ALTER TABLE "MonthlyWinner" ADD CONSTRAINT "MonthlyWinner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
