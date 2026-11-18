import type { MetadataRoute } from "next";

import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** The real website may be listed by search engines; the app and the test site never. */
export default function robots(): MetadataRoute.Robots {
  const e = env();
  if (e.UAT_MODE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/platform",
        "/settings",
        "/leases",
        "/tenants",
        "/units",
        "/payments",
        "/reports",
        "/calendar",
        "/documents",
        "/plan",
        "/account",
        "/invite/",
        "/reset-password",
      ],
    },
    sitemap: `${e.APP_URL}/sitemap.xml`,
  };
}
