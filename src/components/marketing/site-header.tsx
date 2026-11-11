import Link from "next/link";

import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { SITE_NAV } from "@/domain/marketing/content";
import { MobileMenu } from "./mobile-menu";

/** The website's header: product links, then Sign in and the main call to action. */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="Propfolio home">
          <Logo />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((n) => (
            <Button key={n.href} asChild variant="ghost">
              <Link href={n.href}>{n.label}</Link>
            </Button>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {signedIn ? (
            <Button asChild>
              <Link href="/">Open Propfolio</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Start free</Link>
              </Button>
            </>
          )}
        </div>
        <MobileMenu signedIn={signedIn} />
      </div>
    </header>
  );
}
