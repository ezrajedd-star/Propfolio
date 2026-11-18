import { headers } from "next/headers";

import { LANDING_COOKIE, decodeLanding } from "@/domain/marketing/analytics";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  /** Where this browser first landed on the website (for sign-up statistics only). */
  landing?: { path: string; source: string } | null;
}

function cookieValue(h: Headers, name: string): string | undefined {
  for (const part of h.get("cookie")?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/**
 * Client IP and user agent for the audit log. Production must run behind a reverse
 * proxy that overwrites X-Forwarded-For (see README → Deployment).
 */
export function metaFromHeaders(h: Headers): RequestMeta {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: (forwarded || h.get("x-real-ip")) ?? null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    landing: decodeLanding(cookieValue(h, LANDING_COOKIE)),
  };
}

export async function requestMeta(): Promise<RequestMeta> {
  return metaFromHeaders(await headers());
}
