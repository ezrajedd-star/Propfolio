import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A styled native <select>. Native selects are the most familiar and accessible
 * option for non-technical users (and work well on phones), so we prefer them over
 * custom listboxes for simple choices.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "border-input bg-card aria-invalid:border-destructive flex h-11 w-full appearance-none rounded-md border py-2 pr-10 pl-3 text-base shadow-xs disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
