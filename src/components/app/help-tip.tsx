"use client";

import { CircleHelp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A small "?" that explains a field in plain words. Works with keyboard and touch. */
export function HelpTip({
  children,
  label = "More information",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-full"
        >
          <CircleHelp className="size-4.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
