/**
 * DEPRECATED as of 2026-06-25 — DO NOT IMPORT.
 *
 * The `refineWithGroq` flow (which used `GROQ_SKIN_PROMPT` + the
 * `GroqSkinInterpretation` interface exported here) was rolled back
 * because llama-4-scout repeatedly returned malformed multi-property
 * JSON (`Expected ',' or ']' after array element in JSON at position
 * 103`). Multi-property structured JSON with Russian severity
 * classification is too brittle for vision LLMs.
 *
 * Replaced by `analyzeProblemPositions` in `src/server/services/analysisService.ts`,
 * which asks Groq only for coordinate triples (`{type, label, x, y, radius}`)
 * and draws them as positions on the photo in ResultModal — the reliable
 * June-24 pattern that worked in production.
 *
 * Kept in git history only. Safe to delete in a future cleanup pass.
 */

export interface GroqSkinInterpretation {
  skin_type?: string;
  additional_problems?: Array<{
    name: string;
    severity: "лёгкое" | "умеренное" | "выраженное";
  }>;
  severity_overrides?: Array<{
    name: string;
    severity: "лёгкое" | "умеренное" | "выраженное";
  }>;
  notes?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const GROQ_SKIN_PROMPT = "(deprecated — see file header)";
