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
  "tour-button": {
    title: "Show me how",
    body: "Replays the short step-by-step tour for this page.",
  },
  "wizard-steps": {
    title: "Four steps",
    body: "Unit → Tenant → Terms → Review. Progress is saved as you go.",
  },
  "unit-filters": {
    title: "Find the unit",
    body: "Filter by building, or include occupied units to lease from a future date.",
  },
  "unit-list": { title: "Pick the unit", body: "Click a unit's card to choose it." },
  "tenant-type": {
    title: "Company or person",
    body: "Whether the tenant is a company or an individual.",
  },
  "tenant-name": {
    title: "Display name",
    body: "The name everyone sees, including Property Management.",
  },
  "tenant-contact": {
    title: "Contact details",
    body: "Only Leasing Staff and Admins can see these.",
  },
  "building-add": {
    title: "Add building",
    body: "Add a new building: name, short code and address.",
  },
  "building-list": { title: "Buildings", body: "Open a building to add or edit its units." },
  "unit-add": { title: "Add unit", body: "Add one unit with its details." },
  "unit-add-many": {
    title: "Add several units",
    body: "Add many units at once from a list or a range like 101 to 120.",
  },
  "unit-table": { title: "Units", body: "This building's units and whether each is occupied." },
  "report-list": {
    title: "Reports",
    body: "Six ready-made reports; each can be filtered and downloaded.",
  },
  "report-highlights": { title: "Totals", body: "The key numbers for the filters you chose." },
  "report-table": { title: "Details", body: "One line per lease, tenant or payment, with totals." },
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

// ─── Task tours ────────────────────────────────────────────────────────────────

export const TASK_TOUR_IDS = [
  "new-lease",
  "add-tenant",
  "buildings",
  "add-units",
  "reports",
  "report-page",
] as const;
export type TaskTourId = (typeof TASK_TOUR_IDS)[number];

export function isTaskTourId(v: unknown): v is TaskTourId {
  return typeof v === "string" && (TASK_TOUR_IDS as readonly string[]).includes(v);
}

const REPLAY: TourStep = {
  target: "tour-button",
  title: "See this again any time",
  body: "Press “Show me how” at the top of this page to replay these steps.",
};

/**
 * Short tours for the most important tasks. Each starts by itself the first time someone opens
 * the page (after the welcome tour), and replays from the page's “Show me how” button.
 */
export const TASK_TOURS: Record<TaskTourId, { title: string; steps: TourStep[] }> = {
  "new-lease": {
    title: "Adding a lease",
    steps: [
      {
        title: "Adding a lease",
        body: "A new lease takes four short steps. Here is what to expect. It takes about a minute to read.",
      },
      {
        target: "wizard-steps",
        title: "Four steps",
        body: "Unit → Tenant → Terms → Review. Your progress is saved as you go, so you can stop and come back later.",
      },
      {
        target: "unit-filters",
        title: "Find the unit",
        body: "Narrow the list to one building. Only vacant units are shown; switch on “Also show units that are occupied” to lease a unit from a future date.",
      },
      {
        target: "unit-list",
        title: "Pick the unit",
        body: "Click the unit's card. Its type decides when reminder emails go out before the lease ends.",
      },
      {
        target: "wizard-next",
        title: "Then the tenant, terms and review",
        body: "Next you choose an existing tenant or add a new one, then enter the dates, rent, deposit, advance and any increases. The last step shows everything in plain words before you save.",
      },
      REPLAY,
    ],
  },
  "add-tenant": {
    title: "Adding a tenant",
    steps: [
      {
        target: "tenant-type",
        title: "Company or person?",
        body: "Choose whether the tenant is a company or an individual.",
      },
      {
        target: "tenant-name",
        title: "The name everyone sees",
        body: "The display name appears everywhere, including for Property Management. The registered name and TIN are optional and only Leasing sees them.",
      },
      {
        target: "tenant-contact",
        title: "Contact details",
        body: "Who to call or email about the lease. Only Leasing Staff and Admins can see these.",
      },
      {
        target: "tenant-privacy",
        title: "The privacy notice",
        body: "The Data Privacy Act requires the tenant to receive our privacy notice. Print or send it, then tick the box and choose how they acknowledged it.",
      },
      {
        target: "tenant-save",
        title: "Save",
        body: "Press Add tenant. You can then start a lease for them from their page.",
      },
      REPLAY,
    ],
  },
  buildings: {
    title: "Adding a building and its units",
    steps: [
      {
        target: "building-add",
        title: "New building?",
        body: "Add the building first: its name, a short code and the address.",
      },
      {
        target: "building-list",
        title: "Then add its units",
        body: "Open the building to add its units, one at a time or many at once (e.g. 101 to 120).",
      },
      REPLAY,
    ],
  },
  "add-units": {
    title: "Adding units",
    steps: [
      {
        target: "unit-add-many",
        title: "Many units at once",
        body: "Bought a building? Type the unit numbers, or a range like 101 to 120 or G-01 to G-12, choose the unit type, and add them all in one go.",
      },
      {
        target: "unit-add",
        title: "One unit",
        body: "Add a single unit with its floor, floor area and notes. The form stays open so you can add the next one.",
      },
      {
        target: "unit-table",
        title: "Your units",
        body: "Units appear here and on the Units page. Occupancy is worked out from leases; mark a unit Under renovation or Unavailable if it can't be leased.",
      },
      REPLAY,
    ],
  },
  reports: {
    title: "Reports",
    steps: [
      {
        target: "report-list",
        title: "Six ready-made reports",
        body: "Expiries, occupancy, rent roll, collections, overdue aging and renewals. Pick one to open it.",
      },
      {
        target: "report-expiry",
        title: "A good place to start",
        body: "Expiry pipeline lists the leases ending soon, so renewals are planned early.",
      },
      REPLAY,
    ],
  },
  "report-page": {
    title: "Using a report",
    steps: [
      {
        target: "report-filters",
        title: "Choose what to include",
        body: "Pick a building, unit type, dates or how far ahead to look, then press Show report.",
      },
      {
        target: "report-highlights",
        title: "The totals at a glance",
        body: "The key numbers for the filters you chose.",
      },
      {
        target: "report-table",
        title: "The details",
        body: "One line per lease, tenant or payment, with a total at the bottom.",
      },
      {
        target: "report-download",
        title: "Download for Excel",
        body: "Downloads exactly what you see, ready for the owner or the accountant. Downloads are recorded in the audit log.",
      },
      REPLAY,
    ],
  },
};
