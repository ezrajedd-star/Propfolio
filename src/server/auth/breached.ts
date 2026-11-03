import { pwnedCount, pwnedRangeQuery } from "@/domain/auth/breached";
import { env } from "@/server/env";

/**
 * Has this password appeared in a data breach? Asks the free "Have I Been Pwned" range API with
 * only the first 5 characters of the password's hash. If the service can't be reached in 3
 * seconds the answer is "no" (people aren't blocked from changing passwords), and only the error
 * type is logged.
 */
export async function isBreachedPassword(
  password: string,
  options: { enabled?: boolean; fetcher?: typeof fetch } = {},
): Promise<boolean> {
  if (!(options.enabled ?? env().PASSWORD_BREACH_CHECK === "on")) return false;
  const { prefix, suffix } = pwnedRangeQuery(password);
  try {
    const res = await (options.fetcher ?? fetch)(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "Propfolio password check" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return pwnedCount(await res.text(), suffix) > 0;
  } catch (err) {
    console.warn(
      "[password] breach check unavailable:",
      err instanceof Error ? err.name : typeof err,
    );
    return false;
  }
}

export const BREACHED_MESSAGE =
  "This password has appeared in data leaks on other websites, so attackers try it first. Please choose a different one.";
