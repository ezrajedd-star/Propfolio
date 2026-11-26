/**
 * Support tickets: statuses, categories, languages and how a ticket moves between statuses.
 * Pure: no I/O.
 */

export const TICKET_STATUSES = ["NEW", "WAITING_ON_CUSTOMER", "WAITING_ON_US", "RESOLVED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: "New",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  WAITING_ON_US: "Waiting on us",
  RESOLVED: "Resolved",
};

/** What the customer sees in "My requests". */
export const TICKET_STATUS_CUSTOMER_LABELS: Record<TicketStatus, string> = {
  NEW: "Sent",
  WAITING_ON_CUSTOMER: "Waiting for your reply",
  WAITING_ON_US: "We're on it",
  RESOLVED: "Resolved",
};

export const TICKET_CATEGORIES = [
  "HOW_TO",
  "BUG",
  "BILLING",
  "PRIVACY",
  "FEATURE",
  "COMPLAINT",
  "OTHER",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** The question the customer answers when choosing a category. */
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  HOW_TO: "How do I…?",
  BUG: "Something isn't working",
  BILLING: "My plan or a payment",
  PRIVACY: "Privacy or my data",
  FEATURE: "An idea for Propfolio",
  COMPLAINT: "I'm unhappy with something",
  OTHER: "Something else",
};

/** Short names for staff. */
export const TICKET_CATEGORY_SHORT: Record<TicketCategory, string> = {
  HOW_TO: "How-to",
  BUG: "Bug",
  BILLING: "Billing",
  PRIVACY: "Privacy request",
  FEATURE: "Feature request",
  COMPLAINT: "Complaint",
  OTHER: "Other",
};

export const TICKET_LANGUAGES = ["EN", "TL", "CEB"] as const;
export type TicketLanguage = (typeof TICKET_LANGUAGES)[number];

export const TICKET_LANGUAGE_LABELS: Record<TicketLanguage, string> = {
  EN: "English",
  TL: "Tagalog",
  CEB: "Cebuano",
};

export type TicketEvent = "customer_message" | "staff_reply" | "staff_note" | "resolve" | "reopen";

/** The status after something happens on a ticket. */
export function nextTicketStatus(current: TicketStatus, event: TicketEvent): TicketStatus {
  switch (event) {
    case "customer_message":
      return current === "NEW" ? "NEW" : "WAITING_ON_US";
    case "staff_reply":
      return "WAITING_ON_CUSTOMER";
    case "staff_note":
      return current;
    case "resolve":
      return "RESOLVED";
    case "reopen":
      return "WAITING_ON_US";
  }
}

export function ticketNumber(n: number): string {
  return `T-${n}`;
}

/** A subject line from the first words of the description. */
export function ticketSubject(description: string, max = 80): string {
  const line = description.trim().split(/\r?\n/)[0]!.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}

export function isOpen(status: TicketStatus): boolean {
  return status !== "RESOLVED";
}
