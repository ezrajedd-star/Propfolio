import type { MetadataRoute } from "next";

import { TRACKED_PAGES } from "@/domain/marketing/analytics";
import { CHANGELOG } from "@/domain/marketing/pages";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Every website page, for search engines. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env().APP_URL;
  const updated = new Date(`${CHANGELOG[0]!.date}T00:00:00+08:00`);
  return TRACKED_PAGES.filter((p) => p !== "/welcome" && p !== "/status").map((p) => ({
    url: `${base}${p === "/" ? "" : p}`,
    lastModified: updated,
    changeFrequency: p === "/" || p === "/whats-new" ? "weekly" : "monthly",
    priority: p === "/" ? 1 : p === "/pricing" || p === "/product" ? 0.9 : 0.6,
  }));
}
