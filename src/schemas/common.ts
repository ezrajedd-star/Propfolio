import { z } from "zod";

import { PASSWORD_PROBLEM_MESSAGES, checkPassword } from "@/domain/auth/password-policy";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter an email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address, like name@company.com."))
  .transform((v) => v.toLowerCase());

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(120, "Keep the name under 120 characters.");

/** A new password, checked against the password policy. */
export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  const problem = checkPassword(value);
  if (problem) ctx.addIssue({ code: "custom", message: PASSWORD_PROBLEM_MESSAGES[problem] });
});
