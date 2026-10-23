"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  "password-changed": "Your new password is saved ✓",
};

/** Shows a one-off confirmation passed as ?welcome=…, then removes it from the URL. */
export function WelcomeToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.get("welcome");

  useEffect(() => {
    if (!key) return;
    const message = MESSAGES[key];
    if (message) toast.success(message);
    router.replace(pathname);
  }, [key, pathname, router]);

  return null;
}
