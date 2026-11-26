/**
 * Propfolio's own business details, shown on the public pages (Contact, the policies, the footer).
 * ONE place to fill in: anything still marked "[TO SUPPLY …]" shows exactly that on the site, so
 * nothing is invented. The contact email comes from SUPPORT_EMAIL (server setting).
 */
export const TO_SUPPLY = "[TO SUPPLY";

export const COMPANY = {
  tradeName: "Propfolio",
  /** As registered with DTI or SEC. */
  legalName: "[TO SUPPLY: registered business name]",
  /** DTI/SEC registration and BIR TIN, once issued. */
  registration: "[TO SUPPLY: DTI/SEC registration number and TIN]",
  address: "[TO SUPPLY: business address]",
  phone: "[TO SUPPLY: contact phone number]",
  hours: "Monday to Friday, 9:00 AM to 6:00 PM (Philippine time), except public holidays",
  /** Where the data is kept, for the Privacy Policy (owner's decision 5 in the launch brief). */
  dataHosting: "[TO SUPPLY: where the data is hosted, e.g. the provider and country]",
} as const;

/**
 * Companies that process customers' data for us, shown on the Privacy Policy and DPA pages.
 * The lawyer confirms the wording and the list before launch.
 */
export const SUB_PROCESSORS: { name: string; purpose: string; note?: string }[] = [
  { name: "DigitalOcean", purpose: "Hosting the app and its database (Singapore)" },
  { name: "Brevo", purpose: "Sending emails (sign-in codes, reminders, support replies)" },
  { name: "Xendit", purpose: "Taking subscription payments" },
  { name: "Sentry", purpose: "Error reports (the type of error and where in the code only)" },
  {
    name: "Anthropic",
    purpose:
      "AI assistance for support replies and sales follow-ups. Personal details are masked first, tenant records are never sent, and the conversation history is deleted after 30 days.",
    note: "[LAWYER TO CONFIRM]",
  },
];

/** The public pages, in footer order. The payment partner checks that each of these exists. */
export const PUBLIC_PAGES = [
  { href: "/pricing", label: "Pricing" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/dpa", label: "Data Processing Agreement" },
  { href: "/legal/refunds", label: "Refunds and cancellation" },
  { href: "/contact", label: "Contact" },
] as const;

/** True when a detail hasn't been filled in yet (for the launch checklist). */
export function isPlaceholder(value: string | null | undefined): boolean {
  return !value || value.startsWith(TO_SUPPLY);
}
