import { LEAD_STAGES, type LeadStage } from "@/domain/pipeline/pipeline";
import { toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { asSystem, db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { env } from "@/server/env";
import { deliver } from "@/server/mail/transport";

/**
 * What the Growth agent may change on a lead (after approval or under its autonomy level):
 * the follow-up date, a note, and the stage (never to Paying or Lost: those come from real
 * events or a person). Never contact details or consent.
 */
export async function leadUpdateByAgent(p: Record<string, unknown>, now: Date): Promise<string> {
  const id = typeof p.leadId === "string" ? p.leadId : "";
  const follow =
    typeof p.nextFollowUp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.nextFollowUp)
      ? p.nextFollowUp
      : null;
  const note = typeof p.note === "string" ? p.note.trim().slice(0, 2000) : "";
  const stage =
    typeof p.stage === "string" && (LEAD_STAGES as readonly string[]).includes(p.stage)
      ? (p.stage as LeadStage)
      : null;
  if (stage === "PAYING" || stage === "LOST") {
    throw new ValidationError("The Growth agent can't mark a lead Paying or Lost.");
  }
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundError("The lead has gone.");
      await tx.lead.update({
        where: { id },
        data: {
          ...(follow ? { nextFollowUp: toDbDate(follow as IsoDate) } : {}),
          ...(stage && stage !== lead.stage ? { stage, stageChangedAt: now } : {}),
          lastActivityAt: now,
        },
      });
      const parts = [
        follow ? `follow-up ${follow}` : null,
        stage && stage !== lead.stage ? `stage ${lead.stage} → ${stage}` : null,
        note || null,
      ].filter(Boolean);
      await tx.leadActivity.create({
        data: {
          leadId: id,
          kind: "AUTOMATIC",
          text: `Growth agent: ${parts.join("; ")}`,
          actorName: "Growth agent",
          createdAt: now,
        },
      });
    }),
  );
  return "Lead updated";
}

/**
 * A trial nurture email to a lead, only if they agreed to marketing and haven't unsubscribed.
 * Sent through Brevo SMTP with an unsubscribe line.
 */
export async function sendNurtureEmail(p: Record<string, unknown>, now: Date): Promise<string> {
  const id = typeof p.leadId === "string" ? p.leadId : "";
  const subject = typeof p.subject === "string" ? p.subject.slice(0, 150) : "";
  const body = typeof p.body === "string" ? p.body.slice(0, 5000) : "";
  const lead = await asSystem(() => db.lead.findUnique({ where: { id } }));
  if (!lead) throw new NotFoundError("The lead has gone.");
  if (!lead.email || !lead.marketingConsent || lead.unsubscribedAt) {
    throw new ValidationError("No marketing consent: this email can't be sent.");
  }
  const from = env().MARKETING_MAIL_FROM;
  if (!from) {
    throw new ValidationError("Set MARKETING_MAIL_FROM (the marketing subdomain's sender) first.");
  }
  const unsubscribe = env().SUPPORT_EMAIL;
  const footer = `You're getting this because you agreed to hear from Propfolio.${
    unsubscribe ? ` To stop, email ${unsubscribe} with the word "unsubscribe".` : ""
  }`;
  const safe = body.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
  await deliver({
    from,
    to: [lead.email],
    subject,
    text: `${body}\n\n${footer}`,
    html: `<p style="white-space:pre-wrap">${safe}</p><p style="color:#667">${footer}</p>`,
    ...(unsubscribe
      ? { headers: { "List-Unsubscribe": `<mailto:${unsubscribe}?subject=unsubscribe>` } }
      : {}),
  });
  await asSystem(() =>
    db.leadActivity.create({
      data: {
        leadId: id,
        kind: "EMAIL",
        text: `Nurture email sent: ${subject}`,
        actorName: "Growth agent",
        createdAt: now,
      },
    }),
  );
  return "Nurture email sent";
}
