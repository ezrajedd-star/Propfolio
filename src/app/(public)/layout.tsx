import { cookies } from "next/headers";

import { SiteFooterFull } from "@/components/marketing/site-footer-full";
import { SiteHeader } from "@/components/marketing/site-header";

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
    </div>
  );
}
