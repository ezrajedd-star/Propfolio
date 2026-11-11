import { z } from "zod";

import { emailSchema, nameSchema } from "./common";

export const PORTFOLIO_SIZES = ["1–10", "11–50", "51–200", "Over 200"] as const;

/** "Book a demo" on the website. The same schema checks the form and the server. */
export const demoRequestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  company: z
    .string()
    .trim()
    .min(1, "Enter your company, or your own name if you lease personally.")
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
  units: z.enum(PORTFOLIO_SIZES, { error: "Choose how many units you lease out." }),
  message: z.string().trim().max(2000, "Please keep it under 2,000 characters.").default(""),
  /** Hidden from people; bots fill it in. */
  website: z.string().max(200).optional(),
});
export type DemoRequestInput = z.input<typeof demoRequestSchema>;
