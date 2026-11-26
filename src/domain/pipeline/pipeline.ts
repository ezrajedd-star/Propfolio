/**
 * The sales pipeline (Propfolio's own leads, never customers' tenants). Pure: no I/O.
 */

export const LEAD_TYPES = ["LESSOR", "PROPERTY_MANAGER", "ACCOUNTANT", "BROKER", "OTHER"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];
export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  LESSOR: "Lessor",
  PROPERTY_MANAGER: "Property manager",
  ACCOUNTANT: "Accountant",
  BROKER: "Broker",
  OTHER: "Other",
};

export const LEAD_SOURCES = [
  "SIGNUP",
  "DEMO_REQUEST",
  "REFERRAL",
  "MY_NETWORK",
  "FACEBOOK",
  "LINKEDIN",
  "EVENT",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  SIGNUP: "Sign-up",
  DEMO_REQUEST: "Demo request",
  REFERRAL: "Referral",
  MY_NETWORK: "My network",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  EVENT: "Event",
};

export const LEAD_STAGES = ["NEW", "CONTACTED", "TRIAL", "ACTIVE_TRIAL", "PAYING", "LOST"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  TRIAL: "Trial",
  ACTIVE_TRIAL: "Active trial",
  PAYING: "Paying",
  LOST: "Lost",
};

export type PipelineEvent =
  "signup" | "trial_started" | "first_lease" | "first_payment" | "cancelled";

export const PIPELINE_EVENT_LABELS: Record<PipelineEvent, string> = {
  signup: "Signed up",
  trial_started: "Trial started",
  first_lease: "Added their first lease",
  first_payment: "Made their first payment",
  cancelled: "Cancelled",
};

const ORDER: Record<LeadStage, number> = {
  NEW: 0,
  CONTACTED: 1,
  TRIAL: 2,
  ACTIVE_TRIAL: 3,
  PAYING: 4,
  LOST: -1,
};

/**
 * The stage an event moves a lead to, or null to leave it. Automatic moves only go forward
 * (a paying customer isn't moved back to "Trial"); a cancellation always means Lost, and a
 * lost lead that signs up or pays again comes back.
 */
export function autoStage(current: LeadStage, event: PipelineEvent): LeadStage | null {
  if (event === "cancelled") return current === "LOST" ? null : "LOST";
  const target: LeadStage =
    event === "signup" || event === "trial_started"
      ? "TRIAL"
      : event === "first_lease"
        ? "ACTIVE_TRIAL"
        : "PAYING";
  if (current === "LOST") return target;
  return ORDER[target] > ORDER[current] ? target : null;
}

/** The discovery-call notes template. */
export interface DiscoveryNotes {
  currentTool: string;
  pains: [string, string, string];
  /** 1 (mild) to 5 (desperate). */
  painStrength: number | null;
  priceSuggested: string;
  pilotInterest: "yes" | "maybe" | "no" | "";
  bestQuote: string;
}

export const EMPTY_DISCOVERY: DiscoveryNotes = {
  currentTool: "",
  pains: ["", "", ""],
  painStrength: null,
  priceSuggested: "",
  pilotInterest: "",
  bestQuote: "",
};

/** Lost leads are deleted this long after they were lost (configured in src/config/ops.ts). */
export function lostLeadExpired(lostAt: Date, now: Date, months: number): boolean {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return lostAt < cutoff;
}

// ─── Spreadsheet import ──────────────────────────────────────────────────────────────────

export const IMPORT_COLUMNS = [
  "Name",
  "Company",
  "Type",
  "Email",
  "Phone",
  "Source",
  "Stage",
  "Portfolio size (units)",
  "Notes",
  "Next follow-up (YYYY-MM-DD)",
  "Marketing consent (yes/no)",
  "Consent date (YYYY-MM-DD)",
  "Consent source",
] as const;

const byLabel = <T extends string>(labels: Record<T, string>, value: string): T | null => {
  const v = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  for (const [k, label] of Object.entries(labels) as [T, string][]) {
    if (label.toLowerCase() === v || k.toLowerCase().replace(/_/g, " ") === v) return k;
  }
  return null;
};

export interface ImportedLead {
  name: string;
  company: string;
  type: LeadType;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  stage: LeadStage;
  portfolioSize: number | null;
  notes: string;
  nextFollowUp: string | null;
  marketingConsent: boolean;
  consentDate: string | null;
  consentSource: string | null;
}

export type ImportRow = Record<(typeof IMPORT_COLUMNS)[number], string>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check one spreadsheet row. Marketing consent needs a date and where it was given; without
 * them the lead is imported without consent (and never gets marketing emails).
 */
export function parseImportRow(
  row: Partial<ImportRow>,
): { lead: ImportedLead } | { error: string } {
  const cell = (k: (typeof IMPORT_COLUMNS)[number]) => (row[k] ?? "").toString().trim();
  const name = cell("Name");
  if (!name) return { error: "Name is empty" };
  const email = cell("Email").toLowerCase();
  if (email && !EMAIL.test(email)) return { error: `"${email}" isn't an email address` };
  const type = cell("Type") ? byLabel(LEAD_TYPE_LABELS, cell("Type")) : "OTHER";
  if (!type)
    return {
      error: `Type "${cell("Type")}" isn't one of ${Object.values(LEAD_TYPE_LABELS).join(", ")}`,
    };
  const source = cell("Source") ? byLabel(LEAD_SOURCE_LABELS, cell("Source")) : "MY_NETWORK";
  if (!source)
    return {
      error: `Source "${cell("Source")}" isn't one of ${Object.values(LEAD_SOURCE_LABELS).join(", ")}`,
    };
  const stage = cell("Stage") ? byLabel(LEAD_STAGE_LABELS, cell("Stage")) : "NEW";
  if (!stage)
    return {
      error: `Stage "${cell("Stage")}" isn't one of ${Object.values(LEAD_STAGE_LABELS).join(", ")}`,
    };
  const size = cell("Portfolio size (units)").replace(/,/g, "");
  if (size && !/^\d{1,6}$/.test(size)) return { error: "Portfolio size must be a whole number" };
  const follow = cell("Next follow-up (YYYY-MM-DD)");
  if (follow && !ISO.test(follow)) return { error: "Next follow-up must look like 2026-12-01" };
  const consentWord = cell("Marketing consent (yes/no)").toLowerCase();
  if (consentWord && !["yes", "no", "y", "n"].includes(consentWord)) {
    return { error: "Marketing consent must be yes or no" };
  }
  const consentDate = cell("Consent date (YYYY-MM-DD)");
  if (consentDate && !ISO.test(consentDate))
    return { error: "Consent date must look like 2026-12-01" };
  const consentSource = cell("Consent source");
  const saysYes = consentWord === "yes" || consentWord === "y";
  if (saysYes && (!consentDate || !consentSource || !email)) {
    return { error: "Marketing consent needs an email, a consent date and where it was given" };
  }
  return {
    lead: {
      name: name.slice(0, 120),
      company: cell("Company").slice(0, 160),
      type,
      email: email || null,
      phone: cell("Phone").slice(0, 40) || null,
      source,
      stage,
      portfolioSize: size ? Number(size) : null,
      notes: cell("Notes").slice(0, 5000),
      nextFollowUp: follow || null,
      marketingConsent: saysYes,
      consentDate: saysYes ? consentDate : null,
      consentSource: saysYes ? consentSource.slice(0, 200) : null,
    },
  };
}
