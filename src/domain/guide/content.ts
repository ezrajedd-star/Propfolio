/**
 * Words for the on-screen guide. Hints are attached to page elements marked with
 * `data-guide="<id>"`; the Guide shows only the hints for elements on the current screen.
 * Keep each hint to one or two short, plain sentences that say what the thing is for.
 */
import type { Role } from "../auth/roles";

export interface GuideHint {
  title: string;
  body: string;
}

export const GUIDE_HINTS: Record<string, GuideHint> = {
  // Navigation
  "nav-home": {
    title: "Home",
    body: "Your starting point: what needs attention today, totals and occupancy.",
  },
  "nav-calendar": {
    title: "Calendar",
    body: "Lease start and end dates, rent due dates and reminders, by month, week or list.",
  },
  "nav-leases": {
    title: "Leases",
    body: "Every lease in one table, like a spreadsheet. Search, filter, edit and export.",
  },
  "nav-units": {
    title: "Units",
    body: "All units by building, and whether each one is occupied or vacant.",
  },
  "nav-tenants": {
    title: "Tenants",
    body: "Tenant contact details, their leases, balance and documents.",
  },
  "nav-payments": { title: "Payments", body: "Record what a tenant paid and see who is overdue." },
  "nav-reports": { title: "Reports", body: "Six ready-made reports, each downloadable for Excel." },
  "nav-settings": {
    title: "Settings",
    body: "Users, buildings and units, reminder emails, privacy and the audit log (Admins).",
  },
  "guide-button": {
    title: "Guide",
    body: "Turns these notes on and off. Use it whenever you forget what something does.",
  },
  "feedback-button": {
    title: "Send feedback",
    body: "Tell us what went wrong or what was confusing. We see which page you were on.",
  },

  // Home
  "home-attention": {
    title: "What needs your attention",
    body: "Leases ending within 30 days, reminders not yet handled, and overdue rent. Each line has its next step as a button.",
  },
  "home-summary": { title: "Summary", body: "Click a card to see the leases behind the number." },
  "home-occupancy": {
    title: "Occupancy",
    body: "How many units in each building are leased today.",
  },

  // Leases grid
  "new-lease": {
    title: "New lease",
    body: "Opens a 4-step form: unit, tenant, terms, then a plain-language review before saving.",
  },
  "leases-search": {
    title: "Search",
    body: "Type part of a tenant, unit, building or lease number. Spelling doesn't need to be exact.",
  },
  "leases-filters": {
    title: "Quick filters",
    body: "Show only leases ending soon, a status, or overdue rent. Building and unit type filters are below.",
  },
  "leases-columns": {
    title: "Columns",
    body: "Choose which columns to show and their order. Your layout is saved for next time.",
  },
  "leases-export": {
    title: "Export",
    body: "Downloads what you see (same filters and columns) for Excel or as CSV.",
  },
  "leases-grid": {
    title: "The leases table",
    body: "Click a lease number to open it. Remarks, rent due day and contact person can be edited right in the table; you can undo right after.",
  },

  // Lease page
  "lease-primary": {
    title: "Main action",
    body: "The most likely next step for this lease, such as Renew lease. More actions are under More.",
  },
  "tab-overview": {
    title: "Overview",
    body: "Dates, unit, tenant and the money terms in plain words.",
  },
  "tab-payments": {
    title: "Payments tab",
    body: "Every charge, every payment and the balance. Record a payment or add a one-off charge here.",
  },
  "tab-documents": {
    title: "Documents tab",
    body: "The signed contract, amendments and IDs. Opening a file is recorded.",
  },
  "tab-reminders": {
    title: "Reminders tab",
    body: "When reminder emails go out for this lease. Mark as handled stops them.",
  },
  "tab-history": {
    title: "History tab",
    body: "Renewals and every change, with who made it and when.",
  },

  // Payments
  "record-payment": {
    title: "Record payment",
    body: "Choose the lease, enter the amount, and check which charges it pays. You get a printable acknowledgement.",
  },
  "overdue-list": {
    title: "Overdue list",
    body: "Who owes rent past its due date, oldest first, grouped by how late it is.",
  },
  "overdue-export": { title: "Download", body: "The overdue list for Excel or as CSV." },
  "payment-lease": {
    title: "Which lease?",
    body: "Search by tenant, unit or lease number, then pick the lease.",
  },
  "payment-amount": {
    title: "Payment details",
    body: "Enter what was received, the date, how it was paid and the OR, cheque or transfer number.",
  },
  "payment-split": {
    title: "What it pays for",
    body: "Payments go to the oldest unpaid charges first. Switch on 'Change how it's split' to choose yourself.",
  },

  // Calendar
  "calendar-filters": {
    title: "Calendar filters",
    body: "Choose which events to show and narrow to one building.",
  },
  "calendar-view": {
    title: "Calendar",
    body: "Click an event for details and actions. Switch between month, week and list at the top.",
  },

  // Reports
  "report-filters": {
    title: "Filters",
    body: "Pick a building, unit type or dates, then press Show report.",
  },
  "report-download": {
    title: "Download",
    body: "Downloads this report with the same filters, for Excel or as CSV.",
  },

  // Tenants and documents
  "documents-upload": {
    title: "Upload",
    body: "Add a PDF, photo or Word file up to 20 MB, and say what it is.",
  },
  "tenant-privacy": {
    title: "Privacy",
    body: "When the tenant received the privacy notice. Admins can download or anonymise the tenant's data here.",
  },
};

/** One-line explanation of the current screen, by address. */
const PAGE_INTROS: [RegExp, string, string][] = [
  [/^\/$/, "Home", "What needs attention today, at a glance."],
  [/^\/calendar/, "Calendar", "Lease dates, rent due dates and reminders on a calendar."],
  [/^\/leases\/new/, "New lease", "Four short steps. Your progress is saved automatically."],
  [
    /^\/leases\/[^/]+\/edit/,
    "Edit lease",
    "Change dates, rent or terms. You'll see what changes before saving.",
  ],
  [/^\/leases\/[^/]+\/renew/, "Renew lease", "Creates the next lease, linked to this one."],
  [/^\/leases\/[^/]+/, "Lease", "Everything about one lease, in tabs."],
  [/^\/leases/, "Leases", "All leases in one table."],
  [/^\/units/, "Units", "Units by building and whether they are occupied."],
  [/^\/tenants/, "Tenants", "Tenant details, leases, balance and documents."],
  [
    /^\/payments\/new/,
    "Record a payment",
    "Three steps: lease, payment details, and what it pays for.",
  ],
  [
    /^\/payments\/[^/]+/,
    "Payment acknowledgement",
    "Print or save this for the tenant. It is not an official receipt.",
  ],
  [/^\/payments/, "Payments", "Record payments and see who is overdue."],
  [/^\/reports\/.+/, "Report", "Filter, read and download."],
  [/^\/reports/, "Reports", "Choose a report."],
  [/^\/settings/, "Settings", "Set-up for Admins."],
];

export function pageIntro(pathname: string): { title: string; body: string } {
  const hit = PAGE_INTROS.find(([re]) => re.test(pathname));
  return hit ? { title: hit[1], body: hit[2] } : { title: "This page", body: "" };
}

export interface TourStep {
  /** `data-guide` id to point at; none = a centred card. */
  target?: string;
  title: string;
  body: string;
}

/** The welcome tour shown at first sign-in, per role. */
export function tourSteps(role: Role, firstName: string, uat: boolean): TourStep[] {
  const welcome: TourStep = {
    title: `Welcome to Propfolio, ${firstName}`,
    body: "This short tour shows where things are. It takes about a minute. You can skip it and come back any time.",
  };
  const end: TourStep[] = [
    {
      target: "guide-button",
      title: "Forgot what something does?",
      body: "Press Guide. Numbered notes appear next to the main buttons on any page, with a short explanation of each.",
    },
    ...(uat
      ? [
          {
            target: "feedback-button",
            title: "Tell us what you think",
            body: "This is a test version. If something goes wrong or is confusing, press Send feedback and write it down.",
          },
        ]
      : []),
  ];
  if (role === "VIEWER") {
    return [
      welcome,
      {
        target: "nav-home",
        title: "Home",
        body: "Occupancy by building and the leases ending soon.",
      },
      {
        target: "nav-calendar",
        title: "Calendar",
        body: "When leases start and end. Click an event to see the tenant and unit.",
      },
      {
        target: "nav-units",
        title: "Units",
        body: "Every unit and whether it is occupied or vacant today.",
      },
      ...end,
    ];
  }
  return [
    welcome,
    {
      target: "nav-home",
      title: "Start on Home",
      body: "It lists what needs attention today: leases ending soon, reminders not handled and overdue rent.",
    },
    {
      target: "nav-leases",
      title: "Leases",
      body: "Every lease in one table. Search by tenant, unit or lease number, and add a new lease here.",
    },
    {
      target: "nav-calendar",
      title: "Calendar",
      body: "Start and end dates, rent due dates and reminders on a calendar.",
    },
    {
      target: "nav-payments",
      title: "Payments",
      body: "Record what a tenant paid and see who is overdue.",
    },
    {
      target: "nav-reports",
      title: "Reports",
      body: "Expiry pipeline, rent roll, collections and more, ready to download for Excel.",
    },
    ...(role === "ADMIN"
      ? [
          {
            target: "nav-settings",
            title: "Settings",
            body: "Add users, buildings and units, and set reminder emails and privacy.",
          },
        ]
      : []),
    ...end,
  ];
}
