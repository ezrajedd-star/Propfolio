"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Counts one visit per page view on the website (counts only; see /api/v1/visit). */
export function VisitCounter() {
  const path = usePathname();
  useEffect(() => {
    const body = JSON.stringify({ path, referrer: document.referrer });
    try {
      void fetch("/api/v1/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => undefined);
    } catch {
      // Statistics never get in the way.
    }
  }, [path]);
  return null;
}
