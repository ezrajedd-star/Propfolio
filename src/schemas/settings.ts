import { z } from "zod";

/** System settings. Every key has a default, so a fresh database works without seeding. */
export const settingsSchema = z.object({
  companyName: z.string().trim().min(1, "Enter the company name.").max(120),
  /** Display name on outgoing emails. The address itself comes from MAIL_FROM. */
  mailFromName: z.string().trim().min(1, "Enter a sender name.").max(80),
  mailReplyTo: z
    .string()
    .trim()
    .max(254)
    .refine(
      (v) => v === "" || z.email().safeParse(v).success,
      "Enter a valid email address or leave it empty.",
    ),
});
export type Settings = z.infer<typeof settingsSchema>;

export const SETTINGS_DEFAULTS: Settings = {
  companyName: "Your Company",
  mailFromName: "Propfolio",
  mailReplyTo: "",
};

export const updateSettingsSchema = settingsSchema.partial();
