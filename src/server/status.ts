import { reminderStatus, type ServiceStatus } from "@/domain/marketing/status";
import { fromDbDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { asSystem, db } from "@/server/db";

/**
 * What the public status page shows. Only yes/no facts about the service as a whole: nothing
 * about any account, and no error text.
 */
export async function getSystemStatus(now = new Date()): Promise<ServiceStatus[]> {
  const services: ServiceStatus[] = [
    { name: "Website and app", state: "ok", detail: "You're looking at it." },
  ];
  try {
    const [, latest] = await asSystem(() =>
      Promise.all([
        db.$queryRaw`SELECT 1`,
        db.reminderDigest.findFirst({
          orderBy: { digestDate: "desc" },
          select: { digestDate: true },
        }),
      ]),
    );
    services.push({ name: "Database", state: "ok", detail: "Saving and reading normally." });
    const lastDay = latest ? fromDbDate(latest.digestDate) : null;
    const failed = latest
      ? await asSystem(() =>
          db.reminderDigest.count({ where: { digestDate: latest.digestDate, status: "FAILED" } }),
        )
      : 0;
    services.push(reminderStatus(lastDay, failed, manilaToday(now)));
  } catch {
    services.push(
      { name: "Database", state: "down", detail: "We can't reach it right now. We're on it." },
      { name: "Daily reminder emails", state: "unknown", detail: "Waiting for the database." },
    );
  }
  return services;
}
