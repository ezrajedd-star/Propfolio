import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground aria-invalid:border-destructive flex min-h-24 w-full rounded-md border px-3 py-2 text-base shadow-xs disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
