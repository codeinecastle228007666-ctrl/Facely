-- Persist verbatim Face++ /skinanalyze response per analysis so we can
-- re-score old records when scoring logic improves without re-calling the
-- (paid) Face++ API.
ALTER TABLE "SkinAnalysis" ADD COLUMN "rawFacePlus" JSONB;
