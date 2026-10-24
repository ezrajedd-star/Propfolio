"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { isIsoDate, WEEKDAY_NAMES, weekday } from "@/domain/time/calendar-date";
import { formatIsoDate } from "@/domain/time/manila";

/**
 * Date input using the browser's date picker (best on phones), with the chosen date repeated
 * in words underneath ("Friday, 23 Oct 2026") so the day/month order is never ambiguous.
 */
export function DateInput({
  value,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & { value?: string }) {
  const v = typeof value === "string" ? value : "";
  return (
    <div className="space-y-1">
      <Input type="date" value={v} {...props} />
      <p className="text-muted-foreground min-h-5 text-sm" aria-live="polite">
        {isIsoDate(v) ? `${WEEKDAY_NAMES[weekday(v)]}, ${formatIsoDate(v)}` : ""}
      </p>
    </div>
  );
}
