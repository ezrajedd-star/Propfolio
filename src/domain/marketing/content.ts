/**
 * The website's words, in one place (so marketing copy can change without touching layouts).
 * Facts about the product only. Anything still to be supplied by the business is marked
 * "[PLACEHOLDER …]" and shown with a visible "Placeholder" label on the site, so nothing reads as
 * a real customer or a real claim before it is.
 */
import { PLAN_CONFIG, TRIAL_DAYS } from "@/domain/plans/plans";

export const VALUE_PROPOSITION = {
  eyebrow: "The lease ledger for Philippine lessors",
  headline: "Never miss a lease renewal again.",
  subhead:
    "Propfolio keeps every lease, rent schedule and renewal date in one place, and emails your team before each lease ends. Built for the way Philippine lessors work, and ready for the Data Privacy Act.",
  primaryCta: "Start free",
  primaryNote: `Premium free for ${TRIAL_DAYS} days. No card needed.`,
  secondaryCta: "Book a demo",
  proof: [
    "No card needed",
    `Free for up to ${PLAN_CONFIG.FREE.units} units`,
    "Data Privacy Act tools built in",
  ],
};

export type FeatureKey =
  | "reminders"
  | "calendar"
  | "rent"
  | "payments"
  | "import"
  | "reports"
  | "documents"
  | "privacy"
  | "teams"
  | "audit";

export interface Feature {
  key: FeatureKey;
  title: string;
  /** One line for cards. */
  summary: string;
  /** A few lines for the Product page. */
  details: string[];
}

export const FEATURES: Feature[] = [
  {
    key: "reminders",
    title: "Reminders before every lease ends",
    summary: "One email at 6:00 AM with every lease that needs attention, so nothing slips.",
    details: [
      "Lead times per property type: e.g. 60, 30 and 7 days for residential; 180 days ahead for warehouses.",
      "Mark a reminder as handled and it stops; renew the lease and the next one starts.",
      "Missed a day? The next email catches up.",
    ],
  },
  {
    key: "calendar",
    title: "Every lease on one calendar",
    summary: "See what starts, ends and renews this month, and which units are vacant.",
    details: [
      "Month, week and list views, with each lease's end date and status.",
      "A spreadsheet-style table with quick edits, filters and Excel/CSV export.",
      "Occupancy by building, at a glance.",
    ],
  },
  {
    key: "rent",
    title: "Rent that calculates itself",
    summary: "Escalations, deposits and advance rent: the schedule is made for you.",
    details: [
      "Yearly percentage increases or your own schedule of rent changes.",
      "Security deposits and advance rent in months or an amount.",
      "Every amount exact to the centavo, never rounded off by a spreadsheet.",
    ],
  },
  {
    key: "payments",
    title: "Payments and overdue rent",
    summary: "Record payments, see who's overdue and by how long, print acknowledgements.",
    details: [
      "Payments apply to the oldest charges first; credits and voids with a reason.",
      "An overdue list with aging: 1–30, 31–60, 61–90 and over 90 days.",
      "A printable payment acknowledgement for your tenant.",
    ],
  },
  {
    key: "import",
    title: "Start from your spreadsheet",
    summary: "Import buildings, units, tenants and leases from Excel in minutes.",
    details: [
      "A ready template, then every problem listed row by row.",
      "Nothing is saved until the whole file is right.",
      "Export everything back to Excel at any time: your data stays yours.",
    ],
  },
  {
    key: "reports",
    title: "Six ready-made reports",
    summary: "Rent roll, occupancy, expiries, collections and more, one click to Excel.",
    details: [
      "Expiry pipeline, occupancy, rent roll, collections, overdue aging and renewal history.",
      "Filter by building, dates and status.",
    ],
  },
  {
    key: "documents",
    title: "Contracts kept with each lease",
    summary: "Signed contracts and IDs stored privately, opened through short-lived links.",
    details: ["PDF, JPG, PNG or Word, up to 20 MB each.", "Every view is logged."],
  },
  {
    key: "privacy",
    title: "Data Privacy Act-ready",
    summary: "Privacy notice, tenant data export, anonymisation and retention, built in.",
    details: [
      "Record how each tenant received your privacy notice.",
      "Export a tenant's data, or anonymise it when it's no longer needed.",
      "Retention rules that remind you when records can go.",
    ],
  },
  {
    key: "teams",
    title: "Your whole team, the right access",
    summary: "Owner, Admin, Leasing Staff and a read-only role for property managers.",
    details: [
      "Invite people by email; they set their own password or use Google.",
      "Read-only people never see tenant contact or money details.",
    ],
  },
  {
    key: "audit",
    title: "A record of every change",
    summary: "Who changed what, and when, in an audit log nobody can edit.",
    details: ["Sign-ins, changes, exports and downloads, kept for review."],
  },
];

export const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Bring in your units",
    text: "Import your spreadsheet, or add buildings and units by hand.",
  },
  {
    step: "2",
    title: "Add your leases",
    text: "Tenant, dates and rent. The rent schedule and reminders are set up for you.",
  },
  {
    step: "3",
    title: "Get reminded, every time",
    text: "Your team gets one email each morning with the leases that need attention.",
  },
];

export const SEGMENTS = [
  {
    title: "Residential",
    text: "Apartments, condos and boarding houses: short leases, frequent renewals.",
  },
  {
    title: "Commercial and office",
    text: "Multi-year leases with yearly escalations, deposits and advance rent.",
  },
  {
    title: "Industrial and warehouses",
    text: "Long leases where you need to know six months ahead.",
  },
];

/** Facts only: no invented numbers. */
export const FACTS = [
  { value: "6:00 AM", label: "Your daily reminder email" },
  { value: `${TRIAL_DAYS} days`, label: "Free Premium trial, no card" },
  { value: `${PLAN_CONFIG.FREE.units} units`, label: "Free, for as long as you like" },
  { value: "₱0.00", label: "Rounding errors in your rent schedules" },
];

export interface FaqItem {
  q: string;
  a: string;
  category: "Getting started" | "Plans and payments" | "Your data" | "Using Propfolio";
}

export const FAQ: FaqItem[] = [
  {
    category: "Getting started",
    q: "How long does it take to get started?",
    a: "Most people are in within two minutes: sign up with your email or Google, confirm your email with a 6-digit code, and you're in. Importing your units from Excel takes a few minutes more.",
  },
  {
    category: "Getting started",
    q: "Can I bring my existing spreadsheet?",
    a: "Yes. Download our Excel template, paste in your buildings, units, tenants and leases, and upload it. Propfolio checks every row first and lists anything to fix; nothing is saved until the whole file is right.",
  },
  {
    category: "Getting started",
    q: "Do I need to install anything?",
    a: "No. Propfolio works in your browser on a laptop, tablet or phone.",
  },
  {
    category: "Plans and payments",
    q: "Is there really a free plan?",
    a: `Yes. Up to ${PLAN_CONFIG.FREE.units} units with leases, the calendar, daily reminder emails and Excel export, free for as long as you like. New accounts also get Premium free for ${TRIAL_DAYS} days, with no card needed.`,
  },
  {
    category: "Plans and payments",
    q: "What happens when my trial ends?",
    a: "Nothing is deleted. Your account moves to the Free plan; everything stays visible and you can still export. With more than 3 units it becomes read-only until you choose a plan.",
  },
  {
    category: "Plans and payments",
    q: "How do I pay?",
    a: "Monthly, by card, GCash or Maya, on our payment partner's secure page. Propfolio never sees your card details.",
  },
  {
    category: "Plans and payments",
    q: "Can I cancel any time?",
    a: "Yes, from your Plan page. Nothing more is charged and your plan continues to the end of the month you paid for.",
  },
  {
    category: "Your data",
    q: "Who can see my tenants' information?",
    a: "Only people you invite, with the role you choose. Read-only people see tenant names and lease dates, never contact details or money. Your data is kept separate from every other customer's, both in the app and in the database itself.",
  },
  {
    category: "Your data",
    q: "Does Propfolio help with the Data Privacy Act?",
    a: "Yes. It records how each tenant received your privacy notice, can export a tenant's data or anonymise it, and reminds you when records are past their retention period. You remain the personal information controller for your tenants' data.",
  },
  {
    category: "Your data",
    q: "Can I get all my data out?",
    a: "Yes, at any time, in Excel or CSV, on every plan.",
  },
  {
    category: "Using Propfolio",
    q: "Who gets the reminder emails?",
    a: "Your Owner, Admins and Leasing Staff, in one email each morning at 6:00 AM (Philippine time) on days a reminder is due.",
  },
  {
    category: "Using Propfolio",
    q: "Can I set my own reminder lead times?",
    a: "Yes, on Pro and Premium: per property type and per unit. The Free plan uses the standard lead times.",
  },
];

export interface CustomerStory {
  slug: string;
  company: string;
  segment: string;
  quote: string;
  person: string;
  role: string;
  results: { value: string; label: string }[];
  /** Until real stories are supplied, every story is a clearly marked placeholder. */
  placeholder: boolean;
}

export const STORIES: CustomerStory[] = [
  {
    slug: "residential",
    company: "[PLACEHOLDER: Residential lessor]",
    segment: "Residential · 40 units",
    quote: "[PLACEHOLDER: a quote from a real customer about renewals no longer being missed.]",
    person: "[Name]",
    role: "[Role]",
    results: [
      { value: "[x]", label: "renewals caught early" },
      { value: "[x] hrs", label: "saved each month" },
    ],
    placeholder: true,
  },
  {
    slug: "commercial",
    company: "[PLACEHOLDER: Office building owner]",
    segment: "Commercial · 3 buildings",
    quote: "[PLACEHOLDER: a quote about escalations and rent schedules calculating themselves.]",
    person: "[Name]",
    role: "[Role]",
    results: [
      { value: "[x]", label: "leases imported in a day" },
      { value: "[x]%", label: "fewer billing corrections" },
    ],
    placeholder: true,
  },
  {
    slug: "industrial",
    company: "[PLACEHOLDER: Warehouse lessor]",
    segment: "Industrial · 12 warehouses",
    quote: "[PLACEHOLDER: a quote about knowing six months ahead which leases end.]",
    person: "[Name]",
    role: "[Role]",
    results: [
      { value: "[x] days", label: "earlier notice of expiries" },
      { value: "[x]", label: "team members using it daily" },
    ],
    placeholder: true,
  },
];

/** The site's main navigation. */
export const SITE_NAV = [
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/customers", label: "Customers" },
  { href: "/resources", label: "Resources" },
  { href: "/help", label: "Help" },
  { href: "/about", label: "About" },
] as const;

/** Footer columns. */
export const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/security", label: "Security and privacy" },
      { href: "/compare/excel", label: "Propfolio vs Excel" },
      { href: "/whats-new", label: "What's new" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/for/residential", label: "Residential" },
      { href: "/for/commercial", label: "Commercial and office" },
      { href: "/for/industrial", label: "Industrial and warehouses" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/customers", label: "Customer stories" },
      { href: "/partners", label: "Partners" },
      { href: "/contact", label: "Contact and demo" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/resources", label: "Guides and templates" },
      { href: "/help", label: "Help centre and FAQ" },
      { href: "/status", label: "System status" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/dpa", label: "Data Processing Agreement" },
      { href: "/legal/refunds", label: "Refunds and cancellation" },
    ],
  },
] as const;
