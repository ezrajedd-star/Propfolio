"use client";

import { ChevronsUpDown, KeyRound, LogOut, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

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
import { cn } from "@/lib/utils";
import { KeepAlive } from "./keep-alive";
import { Logo } from "./logo";
import { NAV_ITEMS } from "./nav-items";

export interface ShellUser {
  name: string;
  email: string;
  role: Role;
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

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="bg-card sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="bg-sidebar sticky top-0 hidden h-dvh flex-col border-r lg:flex">
        <div className="px-5 pt-6 pb-8">
          <Link href="/" aria-label="Propfolio home">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks role={user.role} />
        </div>
        <div className="border-t p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="bg-card/95 sticky top-0 z-40 flex h-16 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
        <Link href="/" aria-label="Propfolio home">
          <Logo />
        </Link>
        <Button variant="outline" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Menu aria-hidden /> Menu
        </Button>
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
          <div className="border-t p-3">
            <UserMenu user={user} />
          </div>
        </SheetContent>
      </Sheet>

      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <KeepAlive />
    </div>
  );
}
