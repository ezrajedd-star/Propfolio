import type { ReactNode } from "react";

import { HelpTip } from "./help-tip";

export function DetailList({
  items,
}: {
  items: { label: string; value: ReactNode; help?: string }[];
}) {
  return (
    <dl className="divide-y">
      {items.map((i) => (
        <div key={i.label} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
          <dt className="text-muted-foreground flex items-center gap-1">
            {i.label}
            {i.help ? <HelpTip label={`About ${i.label}`}>{i.help}</HelpTip> : null}
          </dt>
          <dd className="sm:col-span-2">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
