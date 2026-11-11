import { addDays, compareDates, type IsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate } from "@/domain/time/manila";

export type ServiceState = "ok" | "degraded" | "down" | "unknown";

export interface ServiceStatus {
  name: string;
  state: ServiceState;
  detail: string;
}

/** Plain labels, always shown with the colour. */
export const STATE_LABELS: Record<ServiceState, string> = {
  ok: "Working",
  degraded: "Delayed",
  down: "Not working",
  unknown: "No data yet",
};

/**
 * The daily reminder emails, judged from the newest day the reminder job recorded (it records
 * every account every morning, even when nothing is due). Yesterday counts as on time, because
 * today's run only happens at 6:00 AM.
 */
export function reminderStatus(
  lastDay: IsoDate | null,
  failedThatDay: number,
  today: IsoDate,
): ServiceStatus {
  const name = "Daily reminder emails";
  if (!lastDay)
    return { name, state: "unknown", detail: "The first reminders haven't gone out yet." };
  if (compareDates(lastDay, addDays(today, -1)) < 0) {
    return {
      name,
      state: "degraded",
      detail: `The last reminders went out on ${formatIsoDate(lastDay)}. We're looking into it.`,
    };
  }
  if (failedThatDay > 0) {
    return {
      name,
      state: "degraded",
      detail: "Some of today's reminder emails are being retried.",
    };
  }
  return { name, state: "ok", detail: `Last sent on ${formatIsoDate(lastDay)}, at 6:00 AM.` };
}

/** The headline across all services. */
export function overallStatus(services: ServiceStatus[]): { state: ServiceState; text: string } {
  if (services.some((s) => s.state === "down")) {
    return { state: "down", text: "Some of Propfolio isn't working right now" };
  }
  if (services.some((s) => s.state === "degraded")) {
    return { state: "degraded", text: "Propfolio is working, with some delays" };
  }
  return { state: "ok", text: "Everything is working" };
}
