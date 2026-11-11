/**
 * Words for the website's further pages: one page per kind of property, the comparison with
 * Excel, the guides, What's new and the partner programme. Facts about Propfolio only; anything
 * still to be decided by the business is marked "[PLACEHOLDER …]" and labelled on the page.
 */
import type { FeatureKey } from "./content";

export type SegmentSlug = "residential" | "commercial" | "industrial";

export interface SegmentPage {
  slug: SegmentSlug;
  label: string;
  /** "residential", "warehouse and industrial": fits "For … lessors". */
  audience: string;
  headline: string;
  lead: string;
  /** The unit type whose standard reminder lead times the page shows. */
  unitType: "Residential" | "Office" | "Warehouse";
  pains: { title: string; text: string }[];
  features: FeatureKey[];
  storySlug: string;
}

export const SEGMENT_PAGES: SegmentPage[] = [
  {
    slug: "residential",
    label: "Residential",
    audience: "residential",
    headline: "Apartments, condos and boarding houses, without the renewal scramble.",
    lead: "Short leases mean renewals every month. Propfolio tells you which tenants to talk to, in time to keep good ones and fill units fast.",
    unitType: "Residential",
    pains: [
      {
        title: "Renewals every month",
        text: "One-year leases across dozens of units: one email each morning lists who to call.",
      },
      {
        title: "Who has paid?",
        text: "Record payments as they come in and see who is late, and by how many days.",
      },
      {
        title: "Tenant IDs and contracts",
        text: "Keep each tenant's signed contract and ID with their lease, privately.",
      },
    ],
    features: ["reminders", "payments", "documents", "privacy"],
    storySlug: "residential",
  },
  {
    slug: "commercial",
    label: "Commercial and office",
    audience: "office and retail",
    headline: "Office and retail leases, with escalations worked out for you.",
    lead: "Multi-year leases with yearly increases, deposits and advance rent. Propfolio builds the rent schedule and reminds you before each renewal talk.",
    unitType: "Office",
    pains: [
      {
        title: "Escalations by hand",
        text: "Enter the yearly increase once; every month's rent is worked out to the centavo.",
      },
      {
        title: "Deposits and advance rent",
        text: "Deposits and advance rent in months or amounts, kept with each lease.",
      },
      {
        title: "Reports for the owners",
        text: "Rent roll, occupancy and collections, one click to Excel.",
      },
    ],
    features: ["rent", "reports", "calendar", "teams"],
    storySlug: "commercial",
  },
  {
    slug: "industrial",
    label: "Industrial and warehouses",
    audience: "warehouse and industrial",
    headline: "Warehouse leases, with six months' warning.",
    lead: "Big units take months to re-let. Propfolio tells you half a year ahead which leases are ending, so you never have an empty warehouse by surprise.",
    unitType: "Warehouse",
    pains: [
      {
        title: "Long notice periods",
        text: "Set lead times per property type and per unit: warehouses get months of warning.",
      },
      {
        title: "A few big tenants",
        text: "Every lease, payment and document for each tenant in one place.",
      },
      {
        title: "A record of every change",
        text: "Who changed what, and when, in an audit log nobody can edit.",
      },
    ],
    features: ["reminders", "rent", "audit", "reports"],
    storySlug: "industrial",
  },
];

/** Propfolio and a spreadsheet, side by side. Facts about Propfolio only. */
export const EXCEL_COMPARISON: { topic: string; excel: string; propfolio: string }[] = [
  {
    topic: "Lease end dates",
    excel: "You have to remember to look.",
    propfolio: "An email each morning lists the leases that need attention.",
  },
  {
    topic: "Rent escalations",
    excel: "Formulas you write and check yourself; one wrong cell and the total is off.",
    propfolio:
      "Enter the yearly increase once; the schedule is made for you, exact to the centavo.",
  },
  {
    topic: "Overdue rent",
    excel: "Colour-coded by hand, if someone updates it.",
    propfolio: "An overdue list with aging: 1–30, 31–60, 61–90 and over 90 days.",
  },
  {
    topic: "Who changed what",
    excel: "Unknown. The file is copied, emailed and overwritten.",
    propfolio: "Every change recorded with who and when, in a log nobody can edit.",
  },
  {
    topic: "Access for your team",
    excel: "Everyone who has the file sees everything.",
    propfolio: "Roles: read-only people never see tenant contact details or money.",
  },
  {
    topic: "Tenant privacy (Data Privacy Act)",
    excel: "Up to you.",
    propfolio: "Privacy notice records, tenant data export, anonymisation and retention reminders.",
  },
  {
    topic: "Contracts and IDs",
    excel: "In folders, shared drives and email.",
    propfolio: "Stored with each lease, opened through short-lived private links.",
  },
  {
    topic: "Price",
    excel: "Included with Office.",
    propfolio: "Free for up to 3 units; paid plans from ₱1,500.00 a month.",
  },
];

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  sections: { heading: string; paragraphs?: string[]; list?: string[] }[];
}

export const GUIDES: Guide[] = [
  {
    slug: "lease-renewal-checklist",
    title: "The lease renewal checklist",
    summary:
      "What to do 90, 60 and 30 days before a lease ends, so renewals never become emergencies.",
    minutes: 4,
    sections: [
      {
        heading: "Why renewals go wrong",
        paragraphs: [
          "Most missed renewals aren't decisions: nobody looked at the date in time. By the time someone notices, the tenant has found another place, or the lease rolls on at last year's rent.",
          "The fix is a routine: the same steps, at the same points before every lease ends.",
        ],
      },
      {
        heading: "90 days before (180 for warehouses and large offices)",
        list: [
          "Decide: do you want this tenant to stay? Check their payment history and any complaints.",
          "Check the market: what would the unit rent for today?",
          "Read the lease: notice periods, renewal options and how the rent may change.",
        ],
      },
      {
        heading: "60 days before",
        list: [
          "Talk to the tenant. Ask about their plans before you send any offer.",
          "Send the renewal offer in writing: new term, new rent, and the date you need an answer by.",
          "If they're leaving, agree a move-out inspection date and start marketing the unit.",
        ],
      },
      {
        heading: "30 days before",
        list: [
          "Have the renewal signed, or confirm the move-out date in writing.",
          "Update the deposit and advance rent if they change.",
          "Record the new lease so the next reminders start on their own.",
        ],
      },
      {
        heading: "Make it automatic",
        paragraphs: [
          "In Propfolio, each property type has its own reminder lead times, and your team gets one email each morning listing the leases due. Renew the lease and the next round of reminders starts by itself.",
        ],
      },
    ],
  },
  {
    slug: "data-privacy-act-for-lessors",
    title: "The Data Privacy Act for lessors, in plain words",
    summary:
      "What the Data Privacy Act (RA 10173) means for the tenant details you keep, and the habits that keep you on the right side of it.",
    minutes: 5,
    sections: [
      {
        heading: "Your tenants' details are personal data",
        paragraphs: [
          "Names, phone numbers, emails, IDs and TINs of individual tenants are personal information. As the lessor who collects them, you are the personal information controller: you decide why they are kept and you answer for keeping them safe.",
          "This guide is a plain introduction, not legal advice. Check your own duties with a lawyer or the National Privacy Commission's guidance.",
        ],
      },
      {
        heading: "Five habits that help",
        list: [
          "Tell tenants what you collect and why: give them a privacy notice when they sign, and keep a record of how they received it.",
          "Collect only what you need for the lease.",
          "Limit who can see it: not everyone in the office needs tenants' phone numbers or IDs.",
          "Keep it only as long as you need it, then delete or anonymise it.",
          "Be ready to answer a tenant who asks for a copy of their data.",
        ],
      },
      {
        heading: "Where spreadsheets fall short",
        paragraphs: [
          "A spreadsheet is copied, emailed and saved on laptops, so there's no telling who has a tenant's details or whether old records were ever removed.",
        ],
      },
      {
        heading: "How Propfolio helps",
        list: [
          "Records how each tenant received your privacy notice.",
          "Roles, so read-only people never see contact details, money or documents.",
          "Exports everything about one tenant when they ask.",
          "Anonymises a tenant's details when they're no longer needed, keeping the financial records.",
          "Reminds you when records are past your retention period.",
        ],
      },
    ],
  },
  {
    slug: "rent-escalation-explained",
    title: "Rent escalation, explained with examples",
    summary:
      "How yearly rent increases add up over a lease, and how to avoid the rounding mistakes spreadsheets make.",
    minutes: 3,
    sections: [
      {
        heading: "Compounding: each increase builds on the last",
        paragraphs: [
          "A 5% yearly increase on ₱50,000.00 a month is not ₱2,500.00 more every year. Each year's increase is worked out on the year before, so the rent grows a little faster each time.",
        ],
        list: [
          "Year 1: ₱50,000.00",
          "Year 2: ₱52,500.00",
          "Year 3: ₱55,125.00",
          "Year 4: ₱57,881.25",
          "Year 5: ₱60,775.31",
        ],
      },
      {
        heading: "Where the centavos go missing",
        paragraphs: [
          "Spreadsheets store numbers as binary fractions. Over many months and formulas, a total can drift by a few centavos, and the rent schedule no longer matches the receipts. Round once, at the end of each step, to two decimal places.",
        ],
      },
      {
        heading: "Check the rules for residential units",
        paragraphs: [
          "Some residential units are covered by the Rent Control Act, which may limit yearly increases. Check the current rules before setting the increase for a residential lease.",
        ],
      },
      {
        heading: "In Propfolio",
        paragraphs: [
          "Enter the starting rent and the yearly percentage, or your own schedule of changes. Propfolio works out every month exactly, with no rounding drift, and shows it on the lease.",
        ],
      },
    ],
  },
];

export interface ChangelogEntry {
  /** ISO date. */
  date: string;
  title: string;
  items: string[];
  tag: "New" | "Improved";
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-11-11",
    title: "A new website",
    tag: "New",
    items: [
      "Product, pricing, customer, help, security and guide pages, with a plan picker.",
      "Book a demo from the Contact page.",
    ],
  },
  {
    date: "2026-11-08",
    title: "Teams and paid plans",
    tag: "New",
    items: [
      "Invite your team by email, each with their own role (Premium).",
      "Choose a plan and pay monthly; upgrade, downgrade or cancel from the Plan page.",
      "Payment records for every payment.",
    ],
  },
  {
    date: "2026-11-07",
    title: "Sign up in two minutes, and bring your spreadsheet",
    tag: "New",
    items: [
      "Start free with your email or Google.",
      "A Getting started list on your home page.",
      "Import buildings, units, tenants and leases from Excel, checked row by row.",
    ],
  },
  {
    date: "2026-11-04",
    title: "Free, Pro and Premium plans",
    tag: "New",
    items: [
      "Free for up to 3 units, for as long as you like.",
      "Every new account gets Premium free for 30 days.",
      "Trial reminders 7 days and 1 day before the trial ends.",
    ],
  },
  {
    date: "2026-11-03",
    title: "Fixes from testing",
    tag: "Improved",
    items: ["Opening a stored document now always works behind the secure connection."],
  },
];

/** The partner programme. Terms still to be decided are marked. */
export const PARTNER_PROGRAMME = {
  who: [
    {
      title: "Real estate brokers",
      text: "You place tenants; your lessor clients need to keep track of the leases you close.",
    },
    {
      title: "Property managers",
      text: "Run several owners' buildings from one sign-in each, with the right access.",
    },
    {
      title: "Accountants and bookkeepers",
      text: "Clean rent rolls and collection reports, in Excel, every month.",
    },
  ],
  offer: "[PLACEHOLDER: referral reward, e.g. a share of the first year's subscription]",
  steps: [
    "Apply below: it takes a minute.",
    "We'll call you to agree the details.",
    "Introduce lessors; we look after them from there.",
  ],
};
