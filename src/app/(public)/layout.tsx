import type { Metadata } from "next";
import { cookies } from "next/headers";

import { SiteFooterFull } from "@/components/marketing/site-footer-full";
import { SiteHeader } from "@/components/marketing/site-header";
import { VisitCounter } from "@/components/marketing/visit-counter";
import { VALUE_PROPOSITION } from "@/domain/marketing/content";
import { env } from "@/server/env";

/**
 * Search engines may list the real website, never the test site. Shared links show a preview
 * card (opengraph-image.tsx) with the page's title and description.
 */
export function generateMetadata(): Metadata {
  const e = env();
  const indexable = !e.UAT_MODE;
  return {
    metadataBase: new URL(e.APP_URL),
    description: VALUE_PROPOSITION.subhead,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Propfolio",
      locale: "en_PH",
      // No fixed title here: each page's own title and description are used when shared.
    },
    twitter: { card: "summary_large_image" },
  };
}

/** The website: anyone can read it, signed in or not (the payment partner checks some pages). */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const signedIn = jar.has("__Host-propfolio_session") || jar.has("propfolio_session");
  return (
    <div className="bg-background flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="focus:bg-background sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:p-3"
      >
        Skip to content
      </a>
      <SiteHeader signedIn={signedIn} />
      <main id="main" className="w-full flex-1">
        {children}
      </main>
      <SiteFooterFull />
      <VisitCounter />
    </div>
  );
}
