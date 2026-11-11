"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SITE_NAV } from "@/domain/marketing/content";

export function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="lg:hidden">
      <Button variant="outline" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu aria-hidden /> Menu
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="border-b px-5 py-5">
            <Logo />
          </div>
          <nav aria-label="Site" className="flex flex-col gap-1 p-3">
            {SITE_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={close}
                className="hover:bg-muted flex h-12 items-center rounded-lg px-3 text-lg font-medium"
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/contact#demo"
              onClick={close}
              className="hover:bg-muted flex h-12 items-center rounded-lg px-3 text-lg font-medium"
            >
              Book a demo
            </Link>
          </nav>
          <div className="space-y-2 border-t p-4">
            {signedIn ? (
              <Button asChild className="w-full" size="lg">
                <Link href="/">Open Propfolio</Link>
              </Button>
            ) : (
              <>
                <Button asChild className="w-full" size="lg">
                  <Link href="/signup" onClick={close}>
                    Start free
                  </Link>
                </Button>
                <Button asChild className="w-full" size="lg" variant="outline">
                  <Link href="/login" onClick={close}>
                    Sign in
                  </Link>
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
