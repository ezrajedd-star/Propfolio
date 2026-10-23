import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  /** One primary action, optionally preceded by quieter secondary ones. */
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="text-muted-foreground max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
