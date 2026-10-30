"use client";

import {
  ChevronsUpDown,
  Compass,
  FlaskConical,
  KeyRound,
  LogOut,
  Menu,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, useTransition } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ROLE_LABELS, can, type Role } from "@/domain/auth/roles";
import type { TaskTourId } from "@/domain/guide/content";
import { cn } from "@/lib/utils";
import { FeedbackButton } from "./feedback-button";
import { GuideButton, GuideProvider, useGuide } from "./guide";
import { KeepAlive } from "./keep-alive";
import { NavigationProgress } from "./navigation-progress";
import { Logo } from "./logo";
import { NAV_ITEMS } from "./nav-items";

export interface ShellUser {
  name: string;
  email: string;
  role: Role;
}

export interface ShellOptions {
  /** Saved per person: whether the welcome tour was done and the Guide is on. */
  guide: { on: boolean; tourDone: boolean; toursDone: TaskTourId[] };
  /** Test (UAT) version: banner and "Send feedback". */
  uat: boolean;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => can(role, item.permission)).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-guide={`nav-${item.href === "/" ? "home" : item.href.slice(1)}`}
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
      })}
    </nav>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = useTransition();
  const { startTour } = useGuide();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hover:bg-muted flex w-full items-center gap-3 rounded-lg p-2 text-left">
          <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-full font-semibold">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{user.name}</span>
            <span className="text-muted-foreground block truncate text-sm">
              {ROLE_LABELS[user.role]}
            </span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound /> My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/change-password">
            <KeyRound /> Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={startTour}>
          <Compass /> Take the tour again
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => startTransition(() => signOutAction())}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  user,
  options,
  children,
}: {
  user: ShellUser;
  options: ShellOptions;
  children: React.ReactNode;
}) {
  return (
    <GuideProvider
      initial={options.guide}
      role={user.role}
      firstName={user.name.trim().split(/\s+/)[0] ?? user.name}
      uat={options.uat}
    >
      <Shell user={user} uat={options.uat}>
        {children}
      </Shell>
    </GuideProvider>
  );
}

function UatBanner() {
  return (
    <div
      role="note"
      className="bg-warning-soft text-warning flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium lg:col-span-2"
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      Test version — the data here is made up. Please don&apos;t enter real tenants&apos; personal
      details.
    </div>
  );
}

function Shell({
  user,
  uat,
  children,
}: {
  user: ShellUser;
  uat: boolean;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr] lg:grid-rows-[auto_1fr]">
      {uat ? <UatBanner /> : null}
      <a
        href="#main"
        className="bg-card sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <div className="bg-sidebar hidden border-r lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col">
          <div className="px-5 pt-6 pb-8">
            <Link href="/" aria-label="Propfolio home">
              <Logo />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto px-3">
            <NavLinks role={user.role} />
          </div>
          <div className="space-y-2 border-t p-3">
            <GuideButton className="w-full justify-start" />
            {uat ? <FeedbackButton className="w-full justify-start" /> : null}
            <UserMenu user={user} />
          </div>
        </aside>
      </div>

      {/* Mobile top bar */}
      <header className="bg-card/95 sticky top-0 z-40 flex h-16 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="Propfolio home">
          <Logo />
        </Link>
        <div className="flex gap-2">
          <GuideButton />
          <Button variant="outline" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu aria-hidden /> Menu
          </Button>
        </div>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="px-5 pt-6 pb-6">
            <Logo />
          </div>
          <div className="flex-1 px-3">
            <NavLinks role={user.role} onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="space-y-2 border-t p-3">
            {uat ? <FeedbackButton className="w-full justify-start" /> : null}
            <UserMenu user={user} />
          </div>
        </SheetContent>
      </Sheet>

      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <KeepAlive />
      <Suspense>
        <NavigationProgress />
      </Suspense>
    </div>
  );
}
