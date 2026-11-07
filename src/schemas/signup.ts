import { z } from "zod";

import { emailSchema, nameSchema, newPasswordSchema } from "./common";

const companyNameSchema = z
  .string()
  .trim()
  .min(1, "Enter the name you lease under: your company, or your own name.")
  .max(120, "Keep the name under 120 characters.");

const acceptLegalSchema = z.literal(true, {
  error: "Please accept the Terms of Service, Privacy Policy and Data Processing Agreement.",
});

/** "Start free": only what's needed, nothing else. */
export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  companyName: companyNameSchema,
  acceptLegal: acceptLegalSchema,
  /** Cloudflare Turnstile's token, when the bot check is on. */
  botToken: z.string().max(4096).optional(),
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signUpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email.")),
});

/** After "Continue with Google", for someone new: the name they lease under, and the checkbox. */
export const googleDetailsSchema = z.object({
  companyName: companyNameSchema,
  acceptLegal: acceptLegalSchema,
});
export type GoogleDetailsInput = z.input<typeof googleDetailsSchema>;

/** A new version of a legal document, accepted at sign-in. */
export const acceptLegalUpdateSchema = z.object({ acceptLegal: acceptLegalSchema });
