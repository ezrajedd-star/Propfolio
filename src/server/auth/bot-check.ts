import { env } from "@/server/env";

export type BotCheck = (token: string | undefined, ipAddress: string | null) => Promise<boolean>;

export function botCheckEnabled(): boolean {
  const e = env();
  return Boolean(e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY);
}

/**
 * Cloudflare Turnstile: is this sign-up from a person? Off (always yes) until both keys are set.
 * A missing or rejected token is refused. If Cloudflare can't be reached in 5 seconds the answer
 * is yes and the error type is logged: an outage there must not stop real people signing up
 * (rate limits still apply).
 */
export function turnstileCheck(fetcher: typeof fetch = fetch): BotCheck {
  return async (token, ipAddress) => {
    if (!botCheckEnabled()) return true;
    if (!token) return false;
    const body = new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY!, response: token });
    if (ipAddress) body.set("remoteip", ipAddress);
    try {
      const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch (err) {
      console.warn("[bot-check] Turnstile unreachable, allowing:", (err as Error).name);
      return true;
    }
  };
}
