import { TZDate } from "@date-fns/tz";

import { BUSINESS_TIME_ZONE } from "./manila";

export function greeting(now: Date = new Date()): string {
  const hour = new TZDate(now, BUSINESS_TIME_ZONE).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
