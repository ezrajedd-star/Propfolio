import { z } from "zod";

import { MAX_MONEY, moneyString, parseMoney } from "@/domain/money/money";
import { isIsoDate } from "@/domain/time/calendar-date";

/** Optional free text: trims, and turns "" into null. */
export const optionalText = (max: number, label = "This") =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (at most ${max} characters).`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Keep this under ${max} characters.`);

export const isoDateSchema = (message = "Enter a date.") =>
  z.string({ error: message }).trim().min(1, message).refine(isIsoDate, "Enter a valid date.");

export const uuidSchema = (message = "Choose one.") => z.uuid({ error: message });

/**
 * Money typed by a person ("50,000.00"). Validated as an exact decimal with at most 2 decimal
 * places, and normalised to "50000.00". Never converted to a float.
 */
export const moneySchema = (opts: { label: string; allowZero?: boolean }) =>
  z
    .string({ error: `Enter the ${opts.label}.` })
    .trim()
    .min(1, `Enter the ${opts.label}.`)
    .superRefine((value, ctx) => {
      const m = parseMoney(value);
      if (!m) {
        ctx.addIssue({
          code: "custom",
          message: `Enter the ${opts.label} as a number, like 25,000.00.`,
        });
        return;
      }
      if (m.isNegative() || (!opts.allowZero && m.isZero())) {
        ctx.addIssue({
          code: "custom",
          message: opts.allowZero
            ? `The ${opts.label} can't be negative.`
            : `The ${opts.label} must be more than zero.`,
        });
      } else if (m.greaterThan(MAX_MONEY)) {
        ctx.addIssue({ code: "custom", message: `That ${opts.label} is too large.` });
      }
    })
    .transform((v) => moneyString(parseMoney(v)!));
