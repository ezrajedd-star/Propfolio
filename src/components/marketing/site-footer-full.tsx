import Link from "next/link";

import { Logo } from "@/components/app/logo";
import { COMPANY } from "@/domain/legal/company";
import { FOOTER_COLUMNS } from "@/domain/marketing/content";

/** The website's footer: four link columns and the company line. */
export function SiteFooterFull() {
  return (
    <footer className="bg-muted/40 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Logo />
          <p className="text-muted-foreground mt-3 max-w-xs">
            The lease ledger for Philippine lessors.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="mb-3 font-semibold">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="text-muted-foreground border-t px-4 py-6 text-center text-sm">
        © {new Date().getFullYear()} {COMPANY.tradeName} · Made in the Philippines
      </p>
    </footer>
  );
}
