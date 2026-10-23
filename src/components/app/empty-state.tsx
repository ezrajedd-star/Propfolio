import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bg-card flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="bg-primary-soft text-primary mb-4 flex size-14 items-center justify-center rounded-full">
        <Icon className="size-7" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="text-muted-foreground mt-2 max-w-md">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
