import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/domain/auth/password-policy";
import { emailSchema } from "./common";
import { isoDateSchema, moneySchema, requiredText } from "./common-fields";

/** Platform admins (Propfolio staff) follow the same password rules as customers. */
export const PLATFORM_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;

const codeSchema = z
  .string({ error: "Enter the 6-digit code from your authenticator app." })
  .trim()
  .regex(/^\d{3} ?\d{3}$/, "Enter the 6-digit code from your authenticator app.");

export const platformSignInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(1024),
  code: codeSchema,
});

export const platformSetupSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z
      .string()
      .min(
        PLATFORM_PASSWORD_MIN_LENGTH,
        `Use at least ${PLATFORM_PASSWORD_MIN_LENGTH} characters. A short sentence works well.`,
      )
      .max(128, "Use at most 128 characters."),
    confirmPassword: z.string(),
    code: codeSchema,
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords don't match.",
  });

export const extendTrialSchema = z.object({
  /** Last day of the trial (Manila date, inclusive). */
  trialEndsOn: isoDateSchema("Choose the last day of the trial."),
  reason: requiredText(500, "Say why the trial is being extended."),
});

export const manualPaymentSchema = z.object({
  amount: moneySchema({ label: "amount received" }),
  /** The account is paid up to and including this Manila date. */
  paidUntil: isoDateSchema("Choose the date the account is paid until."),
  reference: requiredText(120, "Enter the bank or transfer reference."),
  note: z.string().trim().max(500, "Keep this under 500 characters.").optional(),
});

export const suspendAccountSchema = z.object({
  reason: requiredText(500, "Say why the account is being suspended."),
});
