/**
 * Russian declension helper.
 *
 * One / Few / Many rules (with mod-10/mod-100 exceptions):
 *   mod10 === 1 && mod100 !== 11           → "one"  (1 день)
 *   mod10 ∈ 2..4 && !(mod100 ∈ 10..19)     → "few"  (2 дня, 4 дня)
 *   else                                   → "many" (5 дней, 11 дней, 21 день)
 *
 * @param n       – the count
 * @param forms   – tuple of [one, few, many] forms
 * @example pluralRu(1, ["день", "дня", "дней"]) === "день"
 */
export function pluralRu(
  n: number,
  forms: [string, string, string],
): string {
  const abs = Math.abs(n) | 0;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = abs % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
