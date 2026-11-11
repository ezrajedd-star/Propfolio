import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A page section: optional eyebrow, title and lead, then content. */
export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
  center = false,
}: {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <section id={id} className={cn("px-4 py-16 sm:py-20", className)}>
      <div className="mx-auto max-w-6xl">
        {title ? (
          <div className={cn("mb-10 max-w-2xl", center && "mx-auto text-center")}>
            {eyebrow ? (
              <p className="text-primary mb-2 text-sm font-semibold tracking-wide uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
            {lead ? <p className="text-muted-foreground mt-4 text-lg">{lead}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/** Marks content still to be replaced, so it never reads as real. */
export function PlaceholderBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "border-warning bg-warning-soft text-warning inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      Placeholder
    </span>
  );
}
