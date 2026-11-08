import Link from "next/link";

import { COMPANY, PUBLIC_PAGES } from "@/domain/legal/company";

/** Links to every public page (pricing, policies, contact), on public and sign-in pages. */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-muted-foreground w-full text-sm ${className}`}>
      <nav aria-label="About Propfolio" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {PUBLIC_PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-center">
        © {new Date().getFullYear()} {COMPANY.tradeName}
      </p>
    </footer>
  );
}
