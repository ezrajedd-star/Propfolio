import { LogOut } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/app/logo";
import { ConsoleMobileNav, ConsoleNav } from "@/components/platform/console-nav";
import { Button } from "@/components/ui/button";
import { PLATFORM_ROLE_LABELS } from "@/domain/platform/roles";
import { requirePlatformPage } from "@/server/platform/current";
import { ENABLED_SECTIONS } from "@/server/platform/sections";
import { platformSignOutAction } from "../actions";

/**
 * Propfolio's operations console. Separate from the customer app: its own sign-in and staff
 * roles, and it shows account-level information only (never tenants, leases or documents).
 */
export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformPage();
  return (
    <div className="bg-muted/30 flex min-h-dvh flex-col">
      <header className="bg-card border-b">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <ConsoleMobileNav role={admin.role} enabled={ENABLED_SECTIONS} />
            <Link href="/platform" className="flex items-center gap-3">
              <Logo />
              <span className="text-muted-foreground font-medium">Console</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-right sm:block">
              <span className="text-foreground block font-medium">{admin.name}</span>
              <span className="block text-sm">{PLATFORM_ROLE_LABELS[admin.role]}</span>
            </span>
            <form action={platformSignOutAction}>
              <Button type="submit" variant="outline">
                <LogOut aria-hidden /> Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <ConsoleNav role={admin.role} enabled={ENABLED_SECTIONS} />
        <main id="main" className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
