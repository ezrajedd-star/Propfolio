import type { ActionType } from "@/config/agents";
import { asSystem, db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { postAgentReply } from "@/server/tickets/service";
import { createGithubIssue } from "./github";

/**
 * What happens when an agent's item is carried out (after approval, or straight away under
 * "Act and tell" / "Act"). Each returns a short result for the log. Items with no executor (a
 * personal follow-up, a social post) are approved for a person to send or post themselves.
 */
export type Executor = (
  payload: Record<string, unknown>,
  ctx: { approvedByName: string | null; now: Date },
) => Promise<string>;

const str = (v: unknown) => (typeof v === "string" ? v : "");

const EXECUTORS: Partial<Record<ActionType, Executor>> = {
  async TICKET_REPLY(p, ctx) {
    const r = await postAgentReply(
      str(p.ticketId),
      str(p.body),
      { approvedByName: ctx.approvedByName, resolve: p.resolve === true },
      ctx.now,
    );
    return r.emailed ? "Reply sent by email" : "Reply saved (email didn't go out)";
  },
  async TICKET_CLASSIFY(p) {
    const { count } = await asSystem(() =>
      db.ticket.updateMany({
        where: { id: str(p.ticketId) },
        data: { category: str(p.category) as never },
      }),
    );
    if (count !== 1) throw new NotFoundError("The ticket has gone.");
    return `Category set to ${str(p.category)}`;
  },
  async GITHUB_ISSUE(p) {
    const labels = Array.isArray(p.labels) ? p.labels.filter((l) => typeof l === "string") : [];
    const issue = await createGithubIssue({ title: str(p.title), body: str(p.body), labels });
    // A bug from a ticket: remembered, so the customer is told when it is fixed.
    if (str(p.ticketId)) {
      await asSystem(() =>
        db.ticket.updateMany({
          where: { id: str(p.ticketId) },
          data: { bugIssueNumber: issue.number },
        }),
      );
    }
    return `GitHub issue #${issue.number} opened`;
  },
  async LEAD_UPDATE(p, ctx) {
    const { leadUpdateByAgent } = await import("@/server/pipeline/agent");
    return leadUpdateByAgent(p, ctx.now);
  },
  async NURTURE_EMAIL(p, ctx) {
    const { sendNurtureEmail } = await import("@/server/pipeline/agent");
    return sendNurtureEmail(p, ctx.now);
  },
  async HELP_ARTICLE(p, ctx) {
    const { publishArticleFromAgent } = await import("@/server/help/service");
    return publishArticleFromAgent(p, ctx.approvedByName, ctx.now);
  },
  async WEEKLY_REPORT(p) {
    const { emailOwners } = await import("@/server/agents/notify");
    await emailOwners(str(p.subject) || "Weekly growth report", str(p.body));
    return "Report emailed to Platform Owners";
  },
};

export function executorFor(type: string): Executor | null {
  return EXECUTORS[type as ActionType] ?? null;
}

/** Which payload field holds the text a person may edit before approving. */
export const EDITABLE_FIELD: Partial<Record<ActionType, string>> = {
  TICKET_REPLY: "body",
  GITHUB_ISSUE: "body",
  HELP_ARTICLE: "body",
  NURTURE_EMAIL: "body",
  FOLLOW_UP_DRAFT: "body",
  CONTENT_POST: "body",
  WEEKLY_REPORT: "body",
  STATUS_UPDATE: "body",
};
