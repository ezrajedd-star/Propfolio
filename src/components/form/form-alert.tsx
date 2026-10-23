import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const STYLES = {
  error: { cls: "border-danger/30 bg-danger-soft text-danger", Icon: CircleAlert },
  success: { cls: "border-success/30 bg-success-soft text-success", Icon: CircleCheck },
  info: { cls: "border-primary/20 bg-primary-soft text-accent-foreground", Icon: Info },
} as const;

export function FormAlert({
  tone = "error",
  children,
  className,
}: {
  tone?: keyof typeof STYLES;
  children: ReactNode;
  className?: string;
}) {
  const { cls, Icon } = STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-4", cls, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="text-foreground text-base">{children}</div>
    </div>
  );
}
