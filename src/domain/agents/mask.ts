/**
 * Masking personal details before customer text reaches an AI agent: tenant names (the
 * account's own tenants, supplied by the server), ID numbers, phone numbers, email addresses
 * and bank or card numbers. Pure. The customer's own name and company stay (support needs them).
 */

export interface MaskOptions {
  /** Names to hide (the account's tenants and their contact people). */
  names?: readonly string[];
}

const RULES: [RegExp, string][] = [
  // Email addresses.
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  // Philippine TIN (123-456-789 or 123-456-789-000).
  [/\b\d{3}[- ]\d{3}[- ]\d{3}(?:[- ]\d{3,5})?\b/g, "[ID number]"],
  // SSS (12-3456789-0), PhilHealth (12-345678901-2), Pag-IBIG (1234-5678-9012).
  [/\b\d{2}-\d{7}-\d\b/g, "[ID number]"],
  [/\b\d{2}-\d{9}-\d\b/g, "[ID number]"],
  [/\b\d{4}-\d{4}-\d{4}\b/g, "[ID number]"],
  // Passport (P1234567A / AB1234567).
  [/\b[A-Z]{1,2}\d{7}[A-Z]?\b/g, "[ID number]"],
  // Mobile numbers: 0917 123 4567, +63 917 123 4567, 639171234567.
  [/(?:\+?63|\b0)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[phone]"],
  // Card numbers (13 to 19 digits with optional spaces or dashes).
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[card or account number]"],
  // Landlines: (02) 8123 4567, 02-8123-4567.
  [/\(0\d{1,2}\)[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[phone]"],
  [/\b0\d{1,2}[\s-]\d{3,4}[\s-]?\d{4}\b/g, "[phone]"],
  // Long digit runs left over (bank accounts).
  [/\b\d{10,}\b/g, "[card or account number]"],
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function maskPersonalDetails(text: string, options: MaskOptions = {}): string {
  let out = text;
  const names = [
    ...new Set((options.names ?? []).map((n) => n.trim()).filter((n) => n.length >= 3)),
  ]
    // Longest first, so "Juan dela Cruz" goes before "Juan".
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), "[tenant]");
  }
  for (const [re, label] of RULES) out = out.replace(re, label);
  return out;
}
