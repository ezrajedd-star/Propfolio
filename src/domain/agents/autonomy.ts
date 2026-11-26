/**
 * Autonomy: whether an agent's proposed action waits for a person (Draft), happens and is
 * reported (Act and tell), or just happens (Act). Some things are permanently Draft. Pure.
 */
import { ALWAYS_DRAFT, type ActionType } from "@/config/agents";

export const AUTONOMY_LEVELS = ["DRAFT", "ACT_AND_TELL", "ACT"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  DRAFT: "Draft (waits for approval)",
  ACT_AND_TELL: "Act and tell",
  ACT: "Act",
};

/** Flags an agent (or our own checks) put on an item. */
export const SENSITIVE_FLAGS = [
  "refund",
  "billing_dispute",
  "privacy",
  "legal",
  "access_change",
  "pricing",
] as const;
export type SensitiveFlag = (typeof SENSITIVE_FLAGS)[number];

export const SENSITIVE_LABELS: Record<SensitiveFlag, string> = {
  refund: "a refund",
  billing_dispute: "a billing dispute",
  privacy: "a privacy request",
  legal: "a legal threat",
  access_change: "a change to someone's access or permissions",
  pricing: "a price or discount",
};

/** Words that mark a message as one of the permanently-Draft kinds (English, Tagalog, Cebuano). */
const KEYWORDS: Record<SensitiveFlag, RegExp> = {
  refund:
    /\b(refund|reimburse|money back|ibalik (ang|yung) (bayad|pera)|i-refund|refund-an|ibalik ang kwarta)\b/i,
  billing_dispute:
    /\b(charged twice|double charged?|overcharg\w*|chargeback|dispute|wrong (amount|charge)|sobra(ng)? (singil|bayad))\b/i,
  privacy:
    /\b(delete my (data|account|information)|my personal data|data privacy|privacy act|npc|burahin|tanggalin ang (aking|akong) (data|impormasyon))\b/i,
  legal:
    /\b(lawyer|attorney|abogado|sue|suing|lawsuit|court|demanda|kaso|legal action|small claims|ireklamo sa dti)\b/i,
  access_change:
    /\b(add (a )?user|remove (a )?user|give .{0,20}access|make me (the )?(owner|admin)|change (my |the )?role|transfer ownership|reset .{0,15}(password|two-step|2fa) for)\b/i,
  pricing:
    /\b(discount|cheaper|lower (the )?price|promo|special price|tawad|diskwento|libre na lang)\b/i,
};

/** Our own check of the customer's words, whatever the agent says. */
export function detectSensitive(text: string): SensitiveFlag[] {
  return SENSITIVE_FLAGS.filter((f) => KEYWORDS[f].test(text));
}

export interface AutonomyContext {
  /** Ticket category, if the action concerns a ticket. */
  ticketCategory?: string;
  /** Flags from the agent and from detectSensitive. */
  flags?: readonly SensitiveFlag[];
  /** Language of the reply. */
  language?: string;
  /** Days since the agent was first switched on. */
  daysSinceStart?: number;
  /** Tagalog/Cebuano replies stay at Draft for this many days. */
  nonEnglishDraftDays?: number;
  /** A price or discount mentioned that isn't in the plan configuration. */
  offPriceList?: boolean;
}

/** Why this item must wait for a person regardless of the setting, or null. */
export function draftLockReason(type: ActionType, ctx: AutonomyContext = {}): string | null {
  if (ALWAYS_DRAFT.has(type)) return "This kind of item always waits for approval.";
  if (ctx.ticketCategory === "BILLING") return "Billing tickets always wait for approval.";
  if (ctx.ticketCategory === "PRIVACY") return "Privacy requests always wait for approval.";
  const flag = ctx.flags?.[0];
  if (flag) return `It concerns ${SENSITIVE_LABELS[flag]}, which always waits for approval.`;
  if (ctx.offPriceList) return "It mentions a price or discount that isn't in our plans.";
  if (
    ctx.language &&
    ctx.language !== "EN" &&
    (ctx.daysSinceStart ?? 0) < (ctx.nonEnglishDraftDays ?? 30)
  ) {
    return "Tagalog and Cebuano replies wait for approval during the agent's first month.";
  }
  return null;
}

/** The level that actually applies to one item. */
export function effectiveLevel(
  setting: AutonomyLevel,
  type: ActionType,
  ctx: AutonomyContext = {},
): { level: AutonomyLevel; lockedBecause: string | null } {
  const lockedBecause = draftLockReason(type, ctx);
  return lockedBecause
    ? { level: "DRAFT", lockedBecause }
    : { level: setting, lockedBecause: null };
}

/** Prices the agent may mention: only those in the plan configuration. */
export function mentionsOffListPrice(text: string, allowedPesos: readonly string[]): boolean {
  const allowed = new Set(allowedPesos.map((p) => p.replace(/[,.]00$/, "").replace(/,/g, "")));
  const amounts = [...text.matchAll(/(?:₱|PHP|P)\s?([\d,]+(?:\.\d{2})?)/gi)].map((m) =>
    m[1]!.replace(/\.00$/, "").replace(/,/g, ""),
  );
  const percent = /\b\d{1,2}\s?%\s?(off|discount)/i.test(text);
  return percent || amounts.some((a) => !allowed.has(a));
}
