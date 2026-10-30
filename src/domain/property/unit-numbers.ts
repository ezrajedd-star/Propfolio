/**
 * Turn what someone types into a list of unit numbers, for adding many units at once.
 *
 * - One per line or separated by commas: `101, 102, Penthouse`
 * - Ranges with "to" (or an en dash): `101 to 120`, `G-01 to G-12`, `2A01 to 2A05`, `5 to 9`
 * - A plain numeric range with a hyphen: `101-120`
 *
 * Zero padding follows the first number (`G-01 to G-12` → G-01 … G-12). Duplicates are dropped.
 */
export const MAX_UNITS_AT_ONCE = 300;
const MAX_LENGTH = 40;

export type UnitListResult = { ok: true; numbers: string[] } | { ok: false; error: string };

const NAMED_RANGE = /^(.*?)(\d+)\s*(?:\bto\b|–|—)\s*(.*?)(\d+)$/i;
const NUMERIC_RANGE = /^(\d+)\s*-\s*(\d+)$/;

function expandRange(prefix: string, from: string, toPrefix: string, to: string): UnitListResult {
  const p = prefix.trim();
  const p2 = toPrefix.trim();
  if (p2 && p2 !== p) {
    return {
      ok: false,
      error: `“${p}${from} to ${p2}${to}”: both ends need the same beginning, like G-01 to G-12.`,
    };
  }
  const start = Number(from);
  const end = Number(to);
  if (end < start)
    return { ok: false, error: `“${p}${from} to ${p2}${to}”: the range goes backwards.` };
  if (end - start + 1 > MAX_UNITS_AT_ONCE) {
    return { ok: false, error: `Add at most ${MAX_UNITS_AT_ONCE} units at a time.` };
  }
  const width = from.length;
  const out: string[] = [];
  for (let n = start; n <= end; n++) out.push(`${prefix}${String(n).padStart(width, "0")}`.trim());
  return { ok: true, numbers: out };
}

export function expandUnitNumbers(text: string): UnitListResult {
  const parts = text
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: "Type at least one unit number." };
  const all: string[] = [];
  for (const part of parts) {
    const numeric = NUMERIC_RANGE.exec(part);
    const named = numeric ? null : NAMED_RANGE.exec(part);
    if (numeric) {
      const r = expandRange("", numeric[1]!, "", numeric[2]!);
      if (!r.ok) return r;
      all.push(...r.numbers);
    } else if (named) {
      const r = expandRange(named[1]!, named[2]!, named[3]!, named[4]!);
      if (!r.ok) return r;
      all.push(...r.numbers);
    } else {
      all.push(part);
    }
    if (all.length > MAX_UNITS_AT_ONCE) {
      return { ok: false, error: `Add at most ${MAX_UNITS_AT_ONCE} units at a time.` };
    }
  }
  const tooLong = all.find((n) => n.length > MAX_LENGTH);
  if (tooLong)
    return {
      ok: false,
      error: `“${tooLong.slice(0, 20)}…” is too long for a unit number (40 characters at most).`,
    };
  const seen = new Set<string>();
  const numbers = all.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ok: true, numbers };
}

/** "101, 102, 103 … 120" for previews. */
export function describeUnitList(numbers: string[], max = 6): string {
  if (numbers.length <= max) return numbers.join(", ");
  return `${numbers.slice(0, max - 1).join(", ")} … ${numbers[numbers.length - 1]}`;
}
