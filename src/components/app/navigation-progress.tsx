"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Immediate feedback for every click on a link: a bar across the top and a small "Opening…"
 * note until the next page is on screen, so a slow connection never looks like a dead button.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);

  // The new page is showing: done.
  useEffect(() => setPending(false), [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
        return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      setPending(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Never leave it spinning if a navigation is cancelled.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(false), 15_000);
    return () => window.clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <>
      <div aria-hidden className="bg-primary/20 fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden">
        <div className="nav-progress bg-primary h-full w-1/3" />
      </div>
      <div
        role="status"
        className="bg-foreground text-background fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden /> Opening…
      </div>
    </>
  );
}
