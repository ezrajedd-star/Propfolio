"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  Handshake,
  Inbox,
  Kanban,
  LifeBuoy,
  Menu,
  ScrollText,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { platformCan, type PlatformPermission, type PlatformRole } from "@/domain/platform/roles";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: PlatformPermission;
}

/** The console's sections, in order. Each is shown only to roles that may open it. */
export const CONSOLE_NAV: NavItem[] = [
  { href: "/platform", label: "Today", icon: Sun, permission: "console.view" },
  { href: "/platform/accounts", label: "Accounts", icon: Building2, permission: "accounts.view" },
  { href: "/platform/pipeline", label: "Pipeline", icon: Kanban, permission: "pipeline.view" },
  { href: "/platform/tickets", label: "Tickets", icon: LifeBuoy, permission: "tickets.view" },
  { href: "/platform/approvals", label: "Approvals", icon: Inbox, permission: "approvals.view" },
  { href: "/platform/payments", label: "Billing", icon: Wallet, permission: "billing.view" },
  { href: "/platform/agents", label: "Agents", icon: Bot, permission: "agents.view" },
  { href: "/platform/health", label: "System health", icon: Activity, permission: "health.view" },
  {
    href: "/platform/staff-log",
    label: "Staff log",
    icon: ScrollText,
    permission: "stafflog.view",
  },
  { href: "/platform/staff", label: "Staff", icon: Users, permission: "staff.manage" },
];

/** Older pages, kept as quieter links until the pipeline takes them over. */
export const CONSOLE_MORE: NavItem[] = [
  { href: "/platform/help", label: "Help centre", icon: BookOpen, permission: "console.view" },
  {
    href: "/platform/website-leads",
    label: "Partners and downloads",
    icon: Handshake,
    permission: "pipeline.view",
  },
  {
    href: "/platform/website",
    label: "Website visits",
    icon: BarChart3,
    permission: "console.view",
  },
  {
    href: "/platform/demo-requests",
    label: "Demo requests",
    icon: Kanban,
    permission: "pipeline.view",
  },
];

function isActive(pathname: string, href: string) {
  return href === "/platform"
    ? pathname === "/platform"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function Links({
  role,
  enabled,
  onNavigate,
}: {
  role: PlatformRole;
  enabled: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const link = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "text-muted-foreground hover:bg-muted hover:text-foreground flex h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors",
          active && "bg-primary-soft text-accent-foreground hover:bg-primary-soft",
        )}
      >
        <item.icon className={cn("size-5", active && "text-primary")} aria-hidden />
        {item.label}
      </Link>
    );
  };
  const allowed = (i: NavItem) => platformCan(role, i.permission) && enabled.includes(i.href);
  return (
    <nav aria-label="Console" className="flex flex-col gap-1">
      {CONSOLE_NAV.filter(allowed).map(link)}
      <p className="text-muted-foreground mt-4 mb-1 px-3 text-sm font-medium">More</p>
      {CONSOLE_MORE.filter(allowed).map(link)}
    </nav>
  );
}

export function ConsoleNav({ role, enabled }: { role: PlatformRole; enabled: readonly string[] }) {
  return (
    <aside className="bg-card hidden w-64 shrink-0 border-r p-3 lg:block">
      <Links role={role} enabled={enabled} />
    </aside>
  );
}

export function ConsoleMobileNav({
  role,
  enabled,
}: {
  role: PlatformRole;
  enabled: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open the console menu"
      >
        <Menu aria-hidden /> Menu
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-3">
          <SheetTitle className="px-3 pt-2">Console</SheetTitle>
          <Links role={role} enabled={enabled} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
