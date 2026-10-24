import { z } from "zod";

import { isoDateSchema, moneySchema, optionalText, uuidSchema } from "./common-fields";

export const ADVANCE_RENT_TYPES = ["NONE", "MONTHS", "AMOUNT"] as const;
export const ESCALATION_TYPES = ["NONE", "PERCENT", "SCHEDULE"] as const;

const stepSchema = z.object({
  date: isoDateSchema("Enter the date the new rent starts."),
  monthlyRent: moneySchema({ label: "new monthly rent" }),
});

/** Lease terms as entered in the form (step 3 of the wizard, renewal, and editing). */
export const leaseTermsSchema = z
  .object({
    startDate: isoDateSchema("Enter the start date."),
    endDate: isoDateSchema("Enter the end date."),
    monthlyRent: moneySchema({ label: "monthly rent" }),
    rentDueDay: z.coerce
      .number({ error: "Enter a day from 1 to 28." })
      .int("Enter a whole number from 1 to 28.")
      .min(1, "Enter a day from 1 to 28.")
      .max(28, "Use a day from 1 to 28, so it exists in every month."),
    securityDeposit: moneySchema({ label: "security deposit", allowZero: true }),
    advanceRentType: z.enum(ADVANCE_RENT_TYPES),
    advanceRentMonths: z.coerce.number().int().min(1).max(24).nullable().optional(),
    advanceRentAmount: z.string().trim().nullable().optional(),
    escalationType: z.enum(ESCALATION_TYPES),
    escalationPercent: z.string().trim().nullable().optional(),
    escalationEveryMonths: z.coerce.number().int().nullable().optional(),
    escalationSteps: z.array(stepSchema).max(20).nullable().optional(),
    remarks: optionalText(2000, "The remark"),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.endDate && v.endDate <= v.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date must be after the start date.",
      });
    }
    if (v.advanceRentType === "MONTHS" && !v.advanceRentMonths) {
      ctx.addIssue({
        code: "custom",
        path: ["advanceRentMonths"],
        message: "Enter the number of months (1 to 24).",
      });
    }
    if (v.advanceRentType === "AMOUNT") {
      const r = moneySchema({ label: "advance rent" }).safeParse(v.advanceRentAmount ?? "");
      if (!r.success)
        ctx.addIssue({
          code: "custom",
          path: ["advanceRentAmount"],
          message: r.error.issues[0]!.message,
        });
    }
    if (v.escalationType === "PERCENT") {
      const p = Number(v.escalationPercent);
      if (
        !v.escalationPercent ||
        !/^\d+(\.\d{1,3})?$/.test(v.escalationPercent) ||
        p <= 0 ||
        p > 100
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["escalationPercent"],
          message: "Enter a percentage between 0 and 100, like 5.",
        });
      }
      if (
        !v.escalationEveryMonths ||
        v.escalationEveryMonths < 1 ||
        v.escalationEveryMonths > 120
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["escalationEveryMonths"],
          message: "Enter how many months between increases, like 12.",
        });
      }
    }
    if (v.escalationType === "SCHEDULE") {
      const steps = v.escalationSteps ?? [];
      if (steps.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["escalationSteps"],
          message: "Add at least one rent change.",
        });
      }
      steps.forEach((s, i) => {
        if (v.startDate && v.endDate && (s.date <= v.startDate || s.date > v.endDate)) {
          ctx.addIssue({
            code: "custom",
            path: ["escalationSteps", i, "date"],
            message: "The date must be after the start date and on or before the end date.",
          });
        }
      });
      const dates = steps.map((s) => s.date);
      if (new Set(dates).size !== dates.length) {
        ctx.addIssue({
          code: "custom",
          path: ["escalationSteps"],
          message: "Each rent change needs a different date.",
        });
      }
    }
  })
  .transform((v) => ({
    ...v,
    advanceRentMonths: v.advanceRentType === "MONTHS" ? (v.advanceRentMonths ?? null) : null,
    advanceRentAmount:
      v.advanceRentType === "AMOUNT"
        ? moneySchema({ label: "advance rent" }).parse(v.advanceRentAmount ?? "")
        : null,
    escalationPercent:
      v.escalationType === "PERCENT" ? Number(v.escalationPercent).toFixed(3) : null,
    escalationEveryMonths:
      v.escalationType === "PERCENT" ? (v.escalationEveryMonths ?? null) : null,
    escalationSteps:
      v.escalationType === "SCHEDULE"
        ? [...(v.escalationSteps ?? [])].sort((a, b) => a.date.localeCompare(b.date))
        : null,
  }));

export type LeaseTermsInput = z.input<typeof leaseTermsSchema>;
export type LeaseTerms = z.output<typeof leaseTermsSchema>;

export const createLeaseSchema = z
  .object({ unitId: uuidSchema("Choose a unit."), tenantId: uuidSchema("Choose a tenant.") })
  .and(leaseTermsSchema);

export const updateLeaseSchema = createLeaseSchema;

export const terminateLeaseSchema = z.object({
  terminationDate: isoDateSchema("Enter the last day of the lease."),
  reason: z.string().trim().min(5, "Please describe the reason in a few words.").max(1000),
});
