import { z } from "zod";

/**
 * Reminder settings for lease expiry. They are inherited:
 *   system default → unit type → unit override.
 */
export const REPEAT_MODES = ["NONE", "WEEKLY", "DAILY"] as const;
export type RepeatMode = (typeof REPEAT_MODES)[number];

export const reminderConfigSchema = z
  .object({
    /** Days before the end date to send a reminder, e.g. [90, 60, 30]. */
    leadDays: z
      .array(
        z
          .int("Use whole days.")
          .min(1, "Use at least 1 day.")
          .max(730, "Use at most 730 days (2 years)."),
      )
      .min(1, "Add at least one reminder.")
      .max(10, "Use at most 10 reminders.")
      .transform((days) => [...new Set(days)].sort((a, b) => b - a)),
    /** What happens after the last lead-time reminder. */
    repeat: z.enum(REPEAT_MODES),
    /** 0 = Sunday … 6 = Saturday. Only used for WEEKLY. */
    repeatWeekday: z.int().min(0).max(6).nullable(),
    /** Keep repeating for this many days after the end date (until handled/renewed/terminated). */
    afterExpiryDays: z.int("Use whole days.").min(0).max(365, "Use at most 365 days."),
  })
  .refine((c) => c.repeat !== "WEEKLY" || c.repeatWeekday !== null, {
    message: "Choose the day of the week.",
    path: ["repeatWeekday"],
  });

export type ReminderConfig = z.output<typeof reminderConfigSchema>;

/** Confirmed defaults (brief §6, §14). Admins can change them in Settings. */
export const SYSTEM_REMINDER_DEFAULT: ReminderConfig = {
  leadDays: [90, 60, 30],
  repeat: "WEEKLY",
  repeatWeekday: 1,
  afterExpiryDays: 30,
};

export const UNIT_TYPE_REMINDER_DEFAULTS: Record<string, ReminderConfig> = {
  Residential: { ...SYSTEM_REMINDER_DEFAULT, leadDays: [60, 30, 7] },
  Office: { ...SYSTEM_REMINDER_DEFAULT, leadDays: [90, 60, 30] },
  Retail: { ...SYSTEM_REMINDER_DEFAULT, leadDays: [90, 60, 30] },
  Warehouse: { ...SYSTEM_REMINDER_DEFAULT, leadDays: [180, 120, 90, 60, 30] },
  Industrial: { ...SYSTEM_REMINDER_DEFAULT, leadDays: [180, 120, 90, 60, 30] },
  Lot: { ...SYSTEM_REMINDER_DEFAULT, leadDays: [90, 60, 30] },
};

export type ReminderSource = "unit" | "unitType" | "system";

/** The settings that apply to a unit, and where they came from. */
export function effectiveReminderConfig(
  system: ReminderConfig,
  unitType: ReminderConfig | null | undefined,
  unit: ReminderConfig | null | undefined,
): { config: ReminderConfig; source: ReminderSource } {
  if (unit) return { config: unit, source: "unit" };
  if (unitType) return { config: unitType, source: "unitType" };
  return { config: system, source: "system" };
}

/** Parse a stored JSON value; anything invalid is treated as "not set" (inherit). */
export function parseStoredReminderConfig(value: unknown): ReminderConfig | null {
  if (value === null || value === undefined) return null;
  const parsed = reminderConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The "Expiring" window: from the first (largest) lead time until the end date. */
export function expiringWindowDays(config: ReminderConfig): number {
  return Math.max(...config.leadDays);
}
