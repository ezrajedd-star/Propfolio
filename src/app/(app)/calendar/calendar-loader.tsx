"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** FullCalendar measures the page, so it only renders in the browser. */
export const CalendarLoader = dynamic(() => import("./calendar-view").then((m) => m.CalendarView), {
  ssr: false,
  loading: () => (
    <div className="space-y-4" aria-busy="true" aria-label="Loading calendar">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-11 w-72" />
      <Skeleton className="h-[32rem] w-full" />
    </div>
  ),
});
