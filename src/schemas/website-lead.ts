import { z } from "zod";

import { emailSchema, nameSchema } from "./common";

/** The free resources the website offers. */
export const RESOURCES = { "lease-tracker": "Excel lease tracker" } as const;
export type ResourceSlug = keyof typeof RESOURCES;

export const PARTNER_TYPES = [
  "Real estate broker",
  "Property manager",
  "Accountant or bookkeeper",
  "Other",
] as const;

const optionalCompany = z
  .string()
  .trim()
  .max(120, "Keep the name under 120 characters.")
  .default("");
const honeypot = z.string().max(200).optional();

/** "Get the free template": name and email, and whether they'd like product news. */
export const resourceRequestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  company: optionalCompany,
  resource: z.enum(Object.keys(RESOURCES) as [ResourceSlug]),
  wantsUpdates: z.boolean().default(false),
  website: honeypot,
});
export type ResourceRequestInput = z.input<typeof resourceRequestSchema>;

/** "Become a partner". */
export const partnerApplicationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  company: z
    .string()
    .trim()
    .min(1, "Enter your company, or your own name if you work on your own.")
    .max(120, "Keep the name under 120 characters."),
  phone: z
    .string()
    .trim()
    .max(30, "That phone number is too long.")
    .refine(
      (v) => v === "" || /^[0-9+()\-\s]{7,30}$/.test(v),
      "Enter a phone number, like 0917 123 4567.",
    )
    .default(""),
  partnerType: z.enum(PARTNER_TYPES, { error: "Choose what best describes you." }),
  message: z.string().trim().max(2000, "Please keep it under 2,000 characters.").default(""),
  website: honeypot,
});
export type PartnerApplicationInput = z.input<typeof partnerApplicationSchema>;
