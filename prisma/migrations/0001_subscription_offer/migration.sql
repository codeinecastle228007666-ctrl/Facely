-- AlterTable: Add lastSubscriptionOfferSent to User
ALTER TABLE "User" ADD COLUMN "lastSubscriptionOfferSent" TIMESTAMP(3);

-- CreateIndex (optional, for faster lookups)
CREATE INDEX "User_freeAnalyses_idx" ON "User"("freeAnalyses");
