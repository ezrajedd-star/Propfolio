import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <div className="space-y-5 text-center">
      <div className="bg-warning-soft text-warning mx-auto flex size-14 items-center justify-center rounded-full">
        <ShieldX className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold">You don&apos;t have access to that page</h1>
      <p className="text-muted-foreground">
        Your role doesn&apos;t include this part of Propfolio. If you need it for your work, ask an
        Admin.
      </p>
      <Button asChild className="w-full">
        <Link href="/">Go to Home</Link>
      </Button>
    </div>
  );
}
