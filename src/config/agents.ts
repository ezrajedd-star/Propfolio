/**
 * The AI agents' settings in one place: model (pinned), monthly spending cap, what each may do,
 * how fast, and when they run. Autonomy levels start at Draft and are changed only by a
 * Platform Owner on the console's Agents page (stored in the database); the permanent Draft
 * locks are below and can't be changed there. Secrets (API keys) live in the server's
 * environment settings, one set per agent.
 */

export const AGENT_KEYS = ["SUPPORT", "GROWTH", "DIGEST", "ENGINEERING"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

/** Things an agent can propose or do. Each has an autonomy level (Draft / Act and tell / Act). */
export const ACTION_TYPES = [
  "TICKET_REPLY",
  "TICKET_CLASSIFY",
  "GITHUB_ISSUE",
  "HELP_ARTICLE",
  "LEAD_UPDATE",
  "NURTURE_EMAIL",
  "FOLLOW_UP_DRAFT",
  "CONTENT_POST",
  "WEEKLY_REPORT",
  "STATUS_UPDATE",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  TICKET_REPLY: "Reply to a customer's ticket",
  TICKET_CLASSIFY: "Set a ticket's category",
  GITHUB_ISSUE: "Open a GitHub issue",
  HELP_ARTICLE: "Publish a help-centre article",
  LEAD_UPDATE: "Update a lead in the pipeline",
  NURTURE_EMAIL: "Send a trial nurture email",
  FOLLOW_UP_DRAFT: "Personal follow-up (email, LinkedIn, Viber) — always sent by a person",
  CONTENT_POST: "A social media post",
  WEEKLY_REPORT: "The weekly growth report",
  STATUS_UPDATE: "A status-page update during an outage",
};

/**
 * Never more than Draft, whatever the settings say: these always wait for a person. The ticket
 * rules (refunds, privacy, legal, access, prices) are checked per item in domain/agents.
 */
export const ALWAYS_DRAFT: ReadonlySet<ActionType> = new Set<ActionType>([
  "FOLLOW_UP_DRAFT",
  "HELP_ARTICLE",
  "CONTENT_POST",
  "STATUS_UPDATE",
]);

export interface AgentConfig {
  name: string;
  /** What it does, in a line, for the Agents page. */
  purpose: string;
  /** Pinned model id; change it in a reviewed pull request after the evals pass. */
  model: string;
  /** Monthly spending cap in US dollars (a decimal string). The agent stops when it is reached. */
  monthlyCapUsd: string;
  /** Where it runs. */
  runsOn: "managed-agents" | "github-actions" | "worker";
  /** The gateway actions it may call (src/server/agents/actions.ts). */
  actions: readonly string[];
  /** The autonomy settings that apply to it. */
  actionTypes: readonly ActionType[];
  /** Gateway calls per hour, at most. */
  callsPerHour: number;
  /** The environment setting holding its gateway key (for the HTTP agent API). */
  keyEnv: string;
  /** The environment setting holding its own Anthropic API key. */
  anthropicKeyEnv: string;
}

export const AGENTS: Record<AgentKey, AgentConfig> = {
  SUPPORT: {
    name: "Support agent",
    purpose:
      "Answers tickets in English, Tagalog or Cebuano from the help centre; hands over the rest.",
    model: "claude-opus-5-5",
    monthlyCapUsd: "40",
    runsOn: "managed-agents",
    actions: [
      "account_summary",
      "ticket_read",
      "ticket_draft_reply",
      "ticket_classify",
      "ticket_handover",
      "help_search",
      "github_issue_create",
      "approval_submit",
    ],
    actionTypes: ["TICKET_REPLY", "TICKET_CLASSIFY", "GITHUB_ISSUE", "HELP_ARTICLE"],
    callsPerHour: 300,
    keyEnv: "AGENT_KEY_SUPPORT",
    anthropicKeyEnv: "ANTHROPIC_API_KEY_SUPPORT",
  },
  GROWTH: {
    name: "Growth agent",
    purpose: "Keeps the pipeline tidy, ranks who to talk to today, drafts follow-ups and posts.",
    model: "claude-opus-5-5",
    monthlyCapUsd: "40",
    runsOn: "managed-agents",
    actions: [
      "today_metrics",
      "talk_today_list",
      "leads_list",
      "lead_read",
      "lead_update",
      "account_summary",
      "approval_submit",
    ],
    actionTypes: [
      "LEAD_UPDATE",
      "NURTURE_EMAIL",
      "FOLLOW_UP_DRAFT",
      "CONTENT_POST",
      "WEEKLY_REPORT",
    ],
    callsPerHour: 300,
    keyEnv: "AGENT_KEY_GROWTH",
    anthropicKeyEnv: "ANTHROPIC_API_KEY_GROWTH",
  },
  DIGEST: {
    name: "Monday digest",
    purpose: "Writes the short summary at the top of the Monday 7 AM email.",
    model: "claude-haiku-5-5",
    monthlyCapUsd: "5",
    runsOn: "worker",
    actions: ["today_metrics"],
    actionTypes: [],
    callsPerHour: 20,
    keyEnv: "AGENT_KEY_DIGEST",
    anthropicKeyEnv: "ANTHROPIC_API_KEY_DIGEST",
  },
  ENGINEERING: {
    name: "Engineering agent",
    purpose:
      "Fixes bugs in pull requests on GitHub (never merges or deploys), weekly dependency checks.",
    model: "claude-opus-5-5",
    monthlyCapUsd: "50",
    runsOn: "github-actions",
    actions: ["today_metrics", "github_issue_create"],
    actionTypes: ["GITHUB_ISSUE", "STATUS_UPDATE"],
    callsPerHour: 100,
    keyEnv: "AGENT_KEY_ENGINEERING",
    anthropicKeyEnv: "ANTHROPIC_API_KEY_ENGINEERING",
  },
};

/** US dollars per million tokens, and per hour of Managed Agents session time. */
export const MODEL_PRICES: Record<
  string,
  { input: string; output: string; cacheRead: string; cacheWrite: string }
> = {
  "claude-opus-5-5": { input: "4", output: "20", cacheRead: "0.20", cacheWrite: "5" },
  "claude-sonnet-5-5": { input: "2", output: "10", cacheRead: "0.10", cacheWrite: "2.50" },
  "claude-haiku-5-5": { input: "0.10", output: "0.50", cacheRead: "0.01", cacheWrite: "0.125" },
};
export const SESSION_HOUR_USD = "0.08";

export const APPROVALS = {
  /** A daily email to Platform Owners lists approvals waiting longer than this. */
  remindAfterHours: 12,
  reminderCron: "5 9 * * *",
} as const;

/** Managed Agents session history (conversation, files) is deleted after this many days. */
export const AGENT_SESSION_RETENTION_DAYS = 30;
/** Tagalog and Cebuano replies stay at Draft for this many days after the Support agent starts. */
export const NON_ENGLISH_DRAFT_DAYS = 30;
/** The Monday digest: 7 AM Manila every Monday. */
export const DIGEST_CRON = "0 7 * * 1";
/** Housekeeping: deleting old sessions, daily. */
export const AGENT_HOUSEKEEPING_CRON = "50 3 * * *";
