-- 2026-06-26 — Gemini 2.5 Pro Vision is now a parallel provider alongside
-- Face++ and HuggingFace. Persist the verbatim Gemini response per
-- analysis so we can re-score old records when Gemini prompt/schema
-- improves without re-calling the (rate-limited) Gemini API.
ALTER TABLE "SkinAnalysis" ADD COLUMN "rawGemini" JSONB;
