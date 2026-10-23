"use client";

import { useEffect, useRef } from "react";

const IDLE_MS = 30 * 60_000;
const PING_EVERY_MS = 4 * 60_000;

/**
 * Keeps the server session alive while the person is actually using the page (typing in a
 * long form counts), and sends them to the sign-in page once they've been idle for 30 minutes.
 */
export function KeepAlive() {
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());

  useEffect(() => {
    const signedOut = () => window.location.assign("/login?reason=idle");

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity.current >= IDLE_MS) return signedOut();
      lastActivity.current = now;
      if (now - lastPing.current >= PING_EVERY_MS) {
        lastPing.current = now;
        fetch("/api/v1/session/ping", { method: "POST" })
          .then((r) => {
            if (r.status === 401) signedOut();
          })
          .catch(() => {});
      }
    };

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_MS) signedOut();
    }, 30_000);

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, []);

  return null;
}
