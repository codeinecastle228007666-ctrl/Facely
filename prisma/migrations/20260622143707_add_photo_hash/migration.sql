-- AlterTable
ALTER TABLE "SkinAnalysis" ADD COLUMN "photoHash" TEXT;

-- CreateIndex
CREATE INDEX "SkinAnalysis_photoHash_idx" ON "SkinAnalysis"("photoHash");
