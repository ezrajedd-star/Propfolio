/** Help-centre articles: slugs, the simple text format, excerpts and search ranking. Pure. */

export const HELP_CATEGORIES = [
  "Getting started",
  "Buildings and units",
  "Tenants and leases",
  "Payments and reports",
  "Reminders",
  "Users and sign-in",
  "Plan and billing",
  "Privacy and your data",
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

/** "How do I add a unit?" → "how-do-i-add-a-unit". */
export function slugify(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "article";
}

export type Block =
  { type: "p"; text: string } | { type: "ul"; items: string[] } | { type: "h"; text: string };

/**
 * The article format: paragraphs separated by blank lines, "- " lines make a list, and a line
 * starting "## " is a heading. Nothing else is interpreted (no HTML).
 */
export function toBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      blocks.push({ type: "ul", items: lines.map((l) => l.replace(/^\s*-\s+/, "")) });
    } else if (lines.length === 1 && lines[0]!.startsWith("## ")) {
      blocks.push({ type: "h", text: lines[0]!.slice(3).trim() });
    } else {
      blocks.push({ type: "p", text: lines.join(" ") });
    }
  }
  return blocks;
}

export function excerpt(body: string, max = 180): string {
  const text = body
    .replace(/^##\s+/gm, "")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim()}…`;
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "how",
  "do",
  "i",
  "my",
  "of",
  "in",
  "and",
  "is",
  "ang",
  "ng",
  "sa",
  "paano",
  "ko",
]);

export function searchTerms(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .split(/[^a-z0-9ñ]+/)
        .filter((w) => w.length > 1 && !STOP.has(w)),
    ),
  ].slice(0, 8);
}

/** Title matches count three times as much as body matches. */
export function searchScore(
  article: { title: string; body: string },
  terms: readonly string[],
): number {
  const title = article.title.toLowerCase();
  const body = article.body.toLowerCase();
  return terms.reduce((n, t) => n + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
}
