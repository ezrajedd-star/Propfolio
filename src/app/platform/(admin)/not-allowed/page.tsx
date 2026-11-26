import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PLATFORM_ROLE_LABELS } from "@/domain/platform/roles";
import { requirePlatformPage } from "@/server/platform/current";

export const metadata: Metadata = { title: "Not allowed" };

export default async function NotAllowedPage() {
  const admin = await requirePlatformPage();
  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <ShieldAlert className="text-warning mx-auto size-12" aria-hidden />
      <h1 className="text-2xl font-semibold">Your role can&apos;t open this page</h1>
      <p className="text-muted-foreground">
        You are signed in as {PLATFORM_ROLE_LABELS[admin.role]}. If you need this page, ask a
        Platform Owner to change your role.
      </p>
      <Button asChild>
        <Link href="/platform">Back to Today</Link>
      </Button>
    </div>
  );
}
