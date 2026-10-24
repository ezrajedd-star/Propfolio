import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Peso amount input with a ₱ prefix. Accepts "50000", "50,000" or "50,000.00". */
export function MoneyInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        aria-hidden
      >
        ₱
      </span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn("pl-8 tabular-nums", className)}
        {...props}
      />
    </div>
  );
}
