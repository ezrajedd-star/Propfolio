import { headers } from "next/headers";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
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
  };
}

export async function requestMeta(): Promise<RequestMeta> {
  return metaFromHeaders(await headers());
}
