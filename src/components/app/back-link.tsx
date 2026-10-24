import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground mb-4 inline-flex h-10 items-center gap-1"
    >
      <ChevronLeft className="size-5" aria-hidden />
      {children}
    </Link>
  );
}
