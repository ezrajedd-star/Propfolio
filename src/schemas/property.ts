import { z } from "zod";

import { UNIT_STATUS_OVERRIDES } from "@/domain/leases/occupancy";
import { reminderConfigSchema } from "@/domain/reminders/config";
import { optionalText, requiredText, uuidSchema } from "./common-fields";

export const BUILDING_TYPES = ["COMMERCIAL", "RESIDENTIAL", "INDUSTRIAL_COMPLEX", "MIXED"] as const;
export const BUILDING_TYPE_LABELS: Record<(typeof BUILDING_TYPES)[number], string> = {
  COMMERCIAL: "Commercial",
  RESIDENTIAL: "Residential",
  INDUSTRIAL_COMPLEX: "Industrial complex",
  MIXED: "Mixed use",
};

export const buildingSchema = z.object({
  name: requiredText(120, "Enter the building name."),
  code: z
    .string()
    .trim()
    .min(1, "Enter a short code, like TWR1.")
    .max(12, "Keep the code to 12 characters or fewer.")
    .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers and dashes.")
    .transform((v) => v.toUpperCase()),
  address: requiredText(300, "Enter the address."),
  type: z.enum(BUILDING_TYPES, { error: "Choose the building type." }),
  notes: optionalText(2000, "The note"),
});
export type BuildingInput = z.input<typeof buildingSchema>;

export const unitTypeSchema = z.object({
  name: requiredText(60, "Enter a name, like Office."),
  /** Null = use the system default. */
  reminderConfig: reminderConfigSchema.nullable(),
});

const floorAreaSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .refine(
    (v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) < 100_000_000),
    {
      message: "Enter the floor area in square metres, like 120.5.",
    },
  )
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const unitSchema = z.object({
  buildingId: uuidSchema("Choose the building."),
  unitNumber: requiredText(40, "Enter the unit number or name."),
  unitTypeId: uuidSchema("Choose the unit type."),
  floor: optionalText(20, "The floor"),
  floorArea: floorAreaSchema,
  isStandalone: z.boolean().default(false),
  statusOverride: z.enum(UNIT_STATUS_OVERRIDES).nullable().default(null),
  notes: optionalText(2000, "The note"),
});
export type UnitInput = z.input<typeof unitSchema>;

/** Null clears the override (inherit from the unit type). */
export const unitReminderSchema = z.object({ reminderConfig: reminderConfigSchema.nullable() });
