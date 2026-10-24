import Link from "next/link";

import { cn } from "@/lib/utils";

/** Quick filters as large, obvious links. The active one is marked with aria-current. */
export function FilterChips({
  options,
  active,
  hrefFor,
  label,
}: {
  options: { value: string; label: string }[];
  active: string;
  hrefFor: (value: string) => string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === active;
        return (
          <Link
            key={o.value}
            href={hrefFor(o.value)}
            aria-current={on ? "true" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-full border px-4 text-base font-medium transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Build a URL with updated search params (empty values removed). */
export function withParams(
  path: string,
  current: Record<string, string | undefined>,
  changes: Record<string, string | undefined>,
) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}
