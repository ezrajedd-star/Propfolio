/**
 * Website statistics without personal data: counts per day of visits to each website page, by
 * where people came from, and of new accounts by the page people first landed on. No cookies
 * that identify anyone, no IP addresses, no outside service.
 */
import { GUIDES, SEGMENT_PAGES } from "./pages";

/** The website pages counted. Anything else (the app, typos) isn't. */
export const TRACKED_PAGES: readonly string[] = [
  "/",
  "/welcome",
  "/product",
  "/pricing",
  "/customers",
  "/help",
  "/about",
  "/security",
  "/contact",
  "/partners",
  "/compare/excel",
  "/resources",
  "/whats-new",
  "/status",
  "/legal/terms",
  "/legal/privacy",
  "/legal/dpa",
  "/legal/refunds",
  ...SEGMENT_PAGES.map((s) => `/for/${s.slug}`),
  ...GUIDES.map((g) => `/resources/${g.slug}`),
];

/** "/pricing?x=1#a" → "/pricing"; the home page at "/welcome" counts as "/"; others → null. */
export function trackedPath(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 300) return null;
  let p = path.split(/[?#]/)[0]!.toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (p === "/welcome") p = "/";
  return TRACKED_PAGES.includes(p) ? p : null;
}

const KNOWN_SOURCES: [RegExp, string][] = [
  [/(^|\.)google\./, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\./, "Yahoo"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
  [/(^|\.)messenger\.com$/, "Messenger"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "LinkedIn"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X (Twitter)"],
  [/(^|\.)viber\.com$/, "Viber"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "ChatGPT"],
];

/**
 * Where a visit came from, from the referring page's address: a name for well-known sites, the
 * site's host for others (never the path, which can hold search words or ids), "Direct" when
 * there's none or it's our own site.
 */
export function visitSource(referrer: unknown, ownHost: string): string {
  if (typeof referrer !== "string" || !referrer) return "Direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "Direct";
  }
  host = host.replace(/^www\./, "").replace(/^(m|l|lm)\./, "");
  if (!host || host === ownHost.replace(/^www\./, "")) return "Direct";
  for (const [re, name] of KNOWN_SOURCES) if (re.test(host)) return name;
  return host.slice(0, 100);
}

/** The first-visit cookie: where someone first landed and came from. Nothing identifying. */
export const LANDING_COOKIE = "pf_landing";

export function encodeLanding(path: string, source: string): string {
  return encodeURIComponent(JSON.stringify([path, source]));
}

export function decodeLanding(
  value: string | undefined | null,
): { path: string; source: string } | null {
  if (!value) return null;
  try {
    const v = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!Array.isArray(v) || v.length !== 2) return null;
    const path = trackedPath(v[0]);
    const source = typeof v[1] === "string" ? v[1].slice(0, 100) : null;
    return path && source ? { path, source } : null;
  } catch {
    return null;
  }
}

/** Search engines, link previews and monitors: not visitors. */
export function looksLikeBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python|node-fetch|axios/i.test(
    userAgent,
  );
}
