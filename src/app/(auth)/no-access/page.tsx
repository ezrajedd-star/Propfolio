import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const support = reason === "support";
  return (
    <div className="space-y-5 text-center">
      <div className="bg-warning-soft text-warning mx-auto flex size-14 items-center justify-center rounded-full">
        <ShieldX className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold">You don&apos;t have access to that page</h1>
      <p className="text-muted-foreground">
        {support
          ? "Propfolio support can't open this, even with support access: users and their access, billing, your own sign-in settings and data exports stay with the account's own people."
          : "Your role doesn't include this part of Propfolio. If you need it for your work, ask a User Admin."}
      </p>
      <Button asChild className="w-full">
        <Link href="/">Go to Home</Link>
      </Button>
    </div>
  );
}
