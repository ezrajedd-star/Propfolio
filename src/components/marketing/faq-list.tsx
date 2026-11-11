import { ChevronDown } from "lucide-react";

import type { FaqItem } from "@/domain/marketing/content";

/** Questions that open in place (works without JavaScript). */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y rounded-2xl border">
      {items.map((f) => (
        <details key={f.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-medium [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown
              className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="text-muted-foreground px-5 pb-5">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
