"use client";

import {
  ChevronsUpDown,
  Compass,
  FlaskConical,
  Gem,
  KeyRound,
  Lock,
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
import { PLAN_CONFIG, availableOnMessage, planDenial, type PlanName } from "@/domain/plans/plans";
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

/** What the account's plan allows, for menus and banners (the server enforces it). */
export interface ShellPlan {
  plan: PlanName;
  readOnly: boolean;
  trialDaysLeft: number | null;
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

function NavLinks({
  role,
  plan,
  onNavigate,
}: {
  role: Role;
  plan: ShellPlan;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => can(role, item.permission)).map((item) => {
        const active = isActive(pathname, item.href);
        // Locked features stay in the menu, so people can see what upgrading would give them.
        const denial = planDenial({ plan: plan.plan, readOnly: false }, item.permission);
        const locked = denial?.reason === "feature" ? availableOnMessage(denial.feature) : null;
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
            {locked ? (
              <span className="ml-auto flex items-center" title={locked}>
                <Lock className="size-4" aria-hidden />
                <span className="sr-only">({locked})</span>
              </span>
            ) : null}
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
          <Link href="/plan">
            <Gem /> Plan
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
  plan,
  options,
  children,
}: {
  user: ShellUser;
  plan: ShellPlan;
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
      <Shell user={user} plan={plan} uat={options.uat}>
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

/** Read-only, or the trial's last week: a banner every page shows, with a way forward. */
function PlanBanner({ plan }: { plan: ShellPlan }) {
  let text: string | null = null;
  if (plan.readOnly) {
    text = `Read-only: your account has more units than the ${PLAN_CONFIG[plan.plan].label} plan includes. You can still look, export and use the privacy tools.`;
  } else if (plan.trialDaysLeft !== null && plan.trialDaysLeft <= 7) {
    text = `Your free Premium trial ends in ${plan.trialDaysLeft === 1 ? "1 day" : `${plan.trialDaysLeft} days`}. Nothing is deleted when it ends.`;
  }
  if (!text) return null;
  return (
    <div
      role="note"
      className="bg-warning-soft text-warning flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm font-medium lg:col-span-2"
    >
      <span className="flex items-center gap-2">
        {plan.readOnly ? <Lock className="size-4 shrink-0" aria-hidden /> : null}
        {text}
      </span>
      <Link href="/plan" className="underline underline-offset-4">
        See plans
      </Link>
    </div>
  );
}

/** Always visible during the trial: how many days are left. */
function TrialChip({ plan }: { plan: ShellPlan }) {
  if (plan.trialDaysLeft === null) return null;
  return (
    <Link
      href="/plan"
      className="bg-primary-soft text-accent-foreground hover:bg-primary-soft/80 flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
    >
      <Gem className="text-primary size-4 shrink-0" aria-hidden />
      Premium trial: {plan.trialDaysLeft === 1 ? "1 day" : `${plan.trialDaysLeft} days`} left
    </Link>
  );
}

function Shell({
  user,
  plan,
  uat,
  children,
}: {
  user: ShellUser;
  plan: ShellPlan;
  uat: boolean;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr] lg:grid-rows-[auto_1fr]">
      {uat ? <UatBanner /> : null}
      <PlanBanner plan={plan} />
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
            <NavLinks role={user.role} plan={plan} />
          </div>
          <div className="space-y-2 border-t p-3">
            <TrialChip plan={plan} />
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
            <NavLinks role={user.role} plan={plan} onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="space-y-2 border-t p-3">
            <TrialChip plan={plan} />
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
