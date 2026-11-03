import { createHash } from "node:crypto";

/**
 * Checking a new password against passwords seen in data breaches ("Have I Been Pwned", range
 * API). Only the first 5 characters of the password's SHA-1 hash are sent; the service answers
 * with every breached hash starting with them, and the match is made here. Pure helpers; the
 * request itself is in src/server/auth/breached.ts.
 */

export function pwnedRangeQuery(password: string): { prefix: string; suffix: string } {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: sha1.slice(0, 5), suffix: sha1.slice(5) };
}

/** How many times the password appeared in breaches, from the range response ("SUFFIX:COUNT" lines). */
export function pwnedCount(rangeBody: string, suffix: string): number {
  for (const line of rangeBody.split(/\r?\n/)) {
    const [hashSuffix, count] = line.trim().split(":");
    // Padding lines (count 0) are added so the response size doesn't reveal anything.
    if (hashSuffix?.toUpperCase() === suffix) return Number(count) || 0;
  }
  return 0;
}
