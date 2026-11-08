import Link from "next/link";

import { Logo } from "@/components/app/logo";
import { SiteFooter } from "@/components/public/site-footer";
import { Button } from "@/components/ui/button";

/** Public pages: anyone can read them, signed in or not (the payment partner checks them). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/pricing" aria-label="Propfolio">
            <Logo />
          </Link>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/pricing">Pricing</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        {children}
      </main>
      <SiteFooter className="border-t px-4 py-8" />
    </div>
  );
}
