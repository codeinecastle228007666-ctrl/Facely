/**
 * 2026-06-30 — Matcher для статического каталога РФ-брендов.
 *
 * Bestand: `src/data/russianSkincareCatalog.ts`. Каждый каталожный
 * «line» подходит для определённых типов кожи и/или проблем; matcher
 * считает score каждой линейки на основе пересечения с входными
 * (skinType, problems[]) и возвращает top-N.
 *
 * Wire shape: возвращает объект `{ sections: RussianCatalogIndexEntry[] }`
 * где каждая section — это бренд+линейка с конкретными продуктами.
 * Используется analysisService.analyze() для прикрепления поля
 * `russian_products` к клиентскому результату.
 */
import {
  RUSSIAN_CATALOG_INDEX,
  type RussianCatalogIndexEntry,
  type RussianProblem,
  type RussianSkinType,
} from "../data/russianSkincareCatalog";

/**
 * Returned to the client. Each `section` carries the brand+line header
 * AND the recommended products inside it. UI renders brand → line →
 * products WITHOUT a tooltip, so the user can read off the name+brand
 * and search for it in a Russian retail app.
 */
export interface RussianProductsRecommendation {
  sections: RussianCatalogIndexEntry[];
}

// ── Matcher weights ───────────────────────────────────────────
// Each match weighs more if it's both relevant to the user's skin type
// AND to a detected problem. A line that matches skin type only is
// still useful (e.g. увлажняющий крем для сухой), but a line that
// ALSO addresses a specific problem is more compelling.

const SKIN_TYPE_MATCH_WEIGHT = 1;
const PROBLEM_MATCH_WEIGHT = 2;

/**
 * Normalize a problem string from analysis pipeline (e.g. `"акне (лёгкое)"`)
 * to a clean enum value (`"акне"`). Mirrors `cleanName()` helper used in
 * ResultModal / history page but kept here so the matcher is standalone —
 * callers pass the raw `result.problems` and we handle normalisation.
 */
function cleanProblem(problemWithSeverity: string): string {
  // Strip parenthetical severity: "акне (лёгкое)" → "акне"
  return problemWithSeverity.replace(/\s*\(.*?\)\s*$/, "").trim();
}

function isRussianSkinType(s: string): s is RussianSkinType {
  return s === "сухая" || s === "жирная" || s === "комбинированная" || s === "нормальная";
}

function isRussianProblem(s: string): s is RussianProblem {
  return (
    s === "акне" ||
    s === "тёмные круги" ||
    s === "поры" ||
    s === "пигментация" ||
    s === "морщины" ||
    s === "чёрные точки" ||
    s === "мешки под глазами" ||
    s === "отёчность век"
  );
}

/**
 * Score a single catalog line against (skinType, problems). Returns
 * weighted score (higher = better match). Returns 0 when the line is
 * completely off-target — caller filters these out.
 */
function scoreLine(
  line: RussianCatalogIndexEntry,
  skinType: RussianSkinType | null,
  problems: Set<RussianProblem>,
): number {
  let score = 0;
  if (skinType && line.applicableSkinTypes.includes(skinType)) {
    score += SKIN_TYPE_MATCH_WEIGHT;
  }
  // Bonus point for products inside that match problems, weighted
  // higher because problem-specific matches are the most user-valuable
  // suggestion (a generic moisturiser is OK but a salicylic serum for
  // detected acne feels personalised).
  for (const product of line.products) {
    for (const probTag of product.for_problems) {
      if (problems.has(probTag)) score += PROBLEM_MATCH_WEIGHT;
    }
  }
  return score;
}

/**
 * Public entry. Given (skinType, problems[]) returns ranked top-N
 * sections from RUSSIAN_CATALOG_INDEX.
 *
 * Match criteria:
 * - Skin type match: line.applicableSkinTypes includes user's skin type.
 * - Problem match: at least one product in the line has the user's
 *   problem in its for_problems.
 *
 * Returns minimum `MIN_SECTIONS`, maximum `MAX_SECTIONS`. When the
 * matcher finds fewer than MIN_SECTIONS with non-zero score, falls back
 * to top universal lines (skinType alone matches, or problems-unaware
 * lines) so the UI is never empty.
 */
export const russianProductCatalog = {
  recommend(
    skinType: string | null,
    problems: string[],
  ): RussianProductsRecommendation {
    // ── Normalise inputs ────────────────────────────────────────────
    const cleanedProblems = problems
      .map(cleanProblem)
      .filter(isRussianProblem);
    const problemsSet = new Set<RussianProblem>(cleanedProblems);
    const validSkinType: RussianSkinType | null = isRussianSkinType(skinType ?? "")
      ? (skinType as RussianSkinType)
      : null;

    // ── Score all lines ─────────────────────────────────────────────
    const scored = RUSSIAN_CATALOG_INDEX.map((line) => ({
      line,
      score: scoreLine(line, validSkinType, problemsSet),
    }));

    // ── Sort & filter ───────────────────────────────────────────────
    // Sort DESC by score, then alphabetically by brand for stable order
    // when ties exist (deterministic UI).
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.line.brand.localeCompare(b.line.brand, "ru");
    });

    // ── Trim products inside each line to those that match input ────
    // If a line has 4 products but only 1 is relevant to the user's
    // problems, surface just that 1. Universals (empty for_problems)
    // stay — they're always useful.
    const trimmed = scored.map((s): { line: RussianCatalogIndexEntry; score: number } => {
      if (s.score === 0) return s; // don't bother trimming score=0 lines
      const relevantProducts = s.line.products.filter((p) => {
        if (p.for_problems.length === 0) return true; // universal
        return p.for_problems.some((pb) => problemsSet.has(pb));
      });
      // If trimming deleted everything, keep originals (rare — only when
      // every product in the line is hyper-targeted to a problem the user
      // doesn't have).
      return {
        line: {
          ...s.line,
          products: relevantProducts.length > 0 ? relevantProducts : s.line.products,
        },
        score: s.score,
      };
    });

    // ── Return top-N ────────────────────────────────────────────────
    // Pick sections with score >= 1 first; if fewer than MIN_SECTIONS,
    // include zero-score `dry skin + problem unaware` universals so
    // empty results never leave the user with nothing.
    const TOP_N = 5;
    const positive = trimmed.filter((s) => s.score > 0).slice(0, TOP_N);
    const finals: typeof positive =
      positive.length >= MIN_SECTIONS
        ? positive
        : trimmed.slice(0, TOP_N);

    return {
      sections: finals.map((s) => s.line),
    };
  },
};

const MIN_SECTIONS = 2;
