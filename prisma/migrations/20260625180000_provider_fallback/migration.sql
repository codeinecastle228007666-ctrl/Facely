-- 2026-06-25 — Face++ Free Plan balance hit $0. Added HuggingFace
-- Inference API fallback so skin analysis keeps working.
--
-- Migration adds:
--   • `provider`    — which AI produced this record ("faceplus" default,
--                      "huggingface" when fallback kicked in).
--   • `rawHuggingFace` — YOLO detection array from the HF call (only
--                       populated for `provider = "huggingface"`).
--                       Stored separately from `rawFacePlus` so re-scoring
--                       one schema doesn't break the other.
--   • `@@index([provider])` — useful for a future "degraded-mode
--                             analyses" admin filter.
--
-- Existing rows get provider = "faceplus" via the column default, so
-- no `UPDATE` statement is required. The `data_quality` field lives
-- inside the `result` JSON column and is only present for new rows.
-- Old JSON result objects simply have undefined `data_quality` (ResultModal
-- gates on `=== "partial"` so they don't render the degraded banner).

ALTER TABLE "SkinAnalysis"
    ADD COLUMN "provider"        TEXT      NOT NULL DEFAULT 'faceplus',
    ADD COLUMN "rawHuggingFace"  JSONB;

CREATE INDEX "SkinAnalysis_provider_idx" ON "SkinAnalysis"("provider");
