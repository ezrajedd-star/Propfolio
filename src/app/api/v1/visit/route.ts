import type { NextRequest } from "next/server";

import {
  LANDING_COOKIE,
  encodeLanding,
  looksLikeBot,
  trackedPath,
  visitSource,
} from "@/domain/marketing/analytics";
import { env, isSecureDeployment } from "@/server/env";
import { hitRateLimit } from "@/server/rate-limit";
import { metaFromHeaders } from "@/server/request-meta";
import { countWebsiteStat } from "@/server/website-stats/service";

export const dynamic = "force-dynamic";

/**
 * Count one visit to a website page (sent by the page itself). Counts only; nothing about the
 * person is kept. On a first visit it also notes, in a cookie, where they landed and came from,
 * so a later sign-up can be counted against that page. Always answers 204.
 */
export async function POST(req: NextRequest) {
  const done = new Response(null, { status: 204 });
  const meta = metaFromHeaders(req.headers);
  if (looksLikeBot(meta.userAgent)) return done;
  // Only from our own pages.
  const own = new URL(env().APP_URL).host;
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== own) return done;

  let body: { path?: unknown; referrer?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return done;
  }
  const path = trackedPath(body.path);
  if (!path) return done;
  if (!(await hitRateLimit("visitByIp", meta.ipAddress)).allowed) return done;

  const source = visitSource(body.referrer, new URL(env().APP_URL).hostname);
  await countWebsiteStat("VISIT", path, source);
  if (!req.cookies.has(LANDING_COOKIE)) {
    const secure = isSecureDeployment() ? "; Secure" : "";
    done.headers.append(
      "Set-Cookie",
      `${LANDING_COOKIE}=${encodeLanding(path, source)}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax${secure}`,
    );
  }
  return done;
}
