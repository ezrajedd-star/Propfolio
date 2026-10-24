/**
 * Forgiving search: case- and accent-insensitive, ignores punctuation, and matches partial words
 * in any order. "abc corp" finds "ABC Corporation"; "a.b.c" finds "ABC"; "nino" finds "Niño".
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['.’]/g, "") // "A.B.C." → "abc", "O'Neil" → "oneil"
    .replace(/[^a-z0-9@]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Words to look for, at most 8, each at least 1 character. */
export function searchTokens(query: string): string[] {
  return [...new Set(normalizeForSearch(query).split(" ").filter(Boolean))].slice(0, 8);
}

/** Every token appears somewhere in the text. */
export function matchesSearch(text: string, query: string): boolean {
  const haystack = normalizeForSearch(text);
  return searchTokens(query).every((t) => haystack.includes(t));
}

/** Build the stored search column from a record's searchable fields. */
export function buildSearchText(...parts: (string | null | undefined)[]): string {
  return normalizeForSearch(parts.filter(Boolean).join(" "));
}
