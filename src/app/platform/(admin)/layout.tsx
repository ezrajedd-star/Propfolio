import { LogOut } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { requirePlatformPage } from "@/server/platform/current";
import { platformSignOutAction } from "../actions";

/**
 * Propfolio's back office. Separate from the customer app: its own sign-in, and it shows
 * account-level information only (never tenants, leases or documents).
 */
export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformPage();
  return (
    <div className="bg-muted/30 min-h-dvh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/platform" className="flex items-center gap-3">
            <Logo />
            <span className="text-muted-foreground font-medium">Platform admin</span>
          </Link>
          <nav aria-label="Platform" className="flex gap-1">
            <Button asChild variant="ghost">
              <Link href="/platform">Accounts</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/platform/payments">Payments</Link>
            </Button>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden sm:inline">{admin.name}</span>
            <form action={platformSignOutAction}>
              <Button type="submit" variant="outline">
                <LogOut aria-hidden /> Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
