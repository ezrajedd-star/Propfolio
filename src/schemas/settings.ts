import { z } from "zod";

import { SYSTEM_REMINDER_DEFAULT, reminderConfigSchema } from "@/domain/reminders/config";

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
  /** Reminder settings for unit types that don't set their own. */
  reminderDefaults: reminderConfigSchema,
  /** Privacy notice shown when a tenant is added. `{{companyName}}`, `{{dpoName}}`, `{{dpoEmail}}`, `{{retentionYears}}` are filled in. */
  privacyNotice: z.string().trim().min(50, "The privacy notice looks too short.").max(10_000),
  dpoName: z.string().trim().min(1, "Enter who handles privacy questions.").max(120),
  dpoEmail: z.email("Enter a valid email address.").max(254),
  /** Years after a lease ends (or a tenant is archived) before personal data is anonymised. */
  retentionYears: z
    .int("Use whole years.")
    .min(1, "Use at least 1 year.")
    .max(30, "Use at most 30 years."),
  /** Add a short "overdue payments" section to the daily reminder email (needs Payments, Phase 5). */
  digestIncludeOverdue: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

/**
 * Default privacy notice, written to cover the minimum content required by the Data Privacy Act
 * of 2012 (RA 10173, Sec. 16 and 18 and its IRR): who collects the data, what, why, the legal
 * basis, who receives it, how long it is kept, how it is protected, the data subject's rights
 * and how to exercise them, and the right to complain to the National Privacy Commission.
 */
export const DEFAULT_PRIVACY_NOTICE = `PRIVACY NOTICE FOR TENANTS

{{companyName}} ("we") collects and uses your personal information to manage your lease. We follow the Data Privacy Act of 2012 (Republic Act No. 10173).

What we collect
• Name of the tenant (and registered business name for companies)
• Taxpayer Identification Number (TIN), only if you give it to us for invoicing
• Contact person, phone number, email address and billing address
• Lease details, rent schedule, payments and balances
• Signed contracts and related documents

Why we use it
• To prepare, carry out and renew your lease contract
• To bill rent, record payments and send statements and reminders
• To meet our legal, tax and accounting obligations
• To protect our legal rights if there is a dispute

Our legal basis is the lease contract with you and our legal obligations (Sec. 12(b), (c) and (f) of the Act). We do not use your information for marketing, and we do not sell it.

Who sees it
Only our Leasing staff and administrators see your contact and financial details. Property Management staff see only your name and lease dates. We share information only with our accountants, auditors, legal advisers, banks processing your payments, and government agencies when the law requires it.

How long we keep it
We keep your information while your lease is in force and for {{retentionYears}} years after it ends, because written contracts can be the subject of legal claims for up to 10 years (Civil Code, Art. 1144) and tax rules require us to keep accounting records. After that, we anonymise or securely delete it.

How we protect it
Access is limited by role and protected by passwords, account lockout and automatic sign-out. Every access to and change of your records is logged. Documents are stored privately and opened only through short-lived links.

Your rights
You have the right to be informed, to access your information, to object, to have it corrected, to have it erased or blocked when no longer needed, to data portability, and to be compensated for damages. To use any of these rights, or to ask a question, contact our privacy officer:

{{dpoName}} — {{dpoEmail}}

If you think your rights were violated, you may file a complaint with the National Privacy Commission (www.privacy.gov.ph).`;

export const SETTINGS_DEFAULTS: Settings = {
  companyName: "Your Company",
  mailFromName: "Propfolio",
  mailReplyTo: "",
  reminderDefaults: SYSTEM_REMINDER_DEFAULT,
  privacyNotice: DEFAULT_PRIVACY_NOTICE,
  dpoName: "Data Protection Officer",
  dpoEmail: "privacy@example.com",
  retentionYears: 10,
  digestIncludeOverdue: true,
};

export const updateSettingsSchema = settingsSchema.partial();

/** The notice with its placeholders filled in. */
export function renderPrivacyNotice(
  s: Pick<Settings, "privacyNotice" | "companyName" | "dpoName" | "dpoEmail" | "retentionYears">,
): string {
  return s.privacyNotice
    .replaceAll("{{companyName}}", s.companyName)
    .replaceAll("{{dpoName}}", s.dpoName)
    .replaceAll("{{dpoEmail}}", s.dpoEmail)
    .replaceAll("{{retentionYears}}", String(s.retentionYears));
}
