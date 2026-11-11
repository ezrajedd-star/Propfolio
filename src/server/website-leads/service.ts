import type { WebsiteLeadKind } from "@prisma/client";

import { writeAudit } from "@/server/audit";
import { asSystem, db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { env } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import { deliver } from "@/server/mail/transport";
import { reportError } from "@/server/monitoring/report-error";
import type { PlatformActor } from "@/server/platform/auth";
import { hitRateLimit, waitText } from "@/server/rate-limit";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { partnerApplicationSchema, resourceRequestSchema } from "@/schemas/website-lead";

/** Kept for a year, then removed by the housekeeping job. */
export const WEBSITE_LEAD_KEEP_DAYS = 365;

async function limit(meta: RequestMeta, now: Date) {
  const r = await hitRateLimit("websiteLeadByIp", meta.ipAddress, now);
  if (!r.allowed) {
    throw new ValidationError(
      `Too many requests from here. Please wait ${waitText(r.retryAfterSeconds)}, or email us.`,
    );
  }
}

type LeadData = {
  kind: WebsiteLeadKind;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  partnerType?: string;
  resource?: string;
  message?: string;
  wantsUpdates?: boolean;
};

function save(data: LeadData, meta: RequestMeta, now: Date) {
  return asSystem(() =>
    db.$transaction(async (tx) => {
      const lead = await tx.websiteLead.create({ data: { ...data, createdAt: now } });
      await writeAudit(
        {
          actor: null,
          action: data.kind === "PARTNER" ? "website.partner_apply" : "website.resource_request",
          entityType: "WebsiteLead",
          entityId: lead.id,
          // No personal details in the audit log.
          metadata:
            data.kind === "PARTNER"
              ? { partnerType: data.partnerType }
              : { resource: data.resource },
          meta,
          accountId: null,
        },
        tx,
      );
      return lead;
    }),
  );
}

/**
 * "Get the free template". Anyone can ask; it is rate-limited, and bots that fill the hidden
 * field get the same answer without anything being kept.
 */
export async function requestResource(input: unknown, meta: RequestMeta, now = new Date()) {
  const data = parseInput(resourceRequestSchema, input);
  await limit(meta, now);
  if (data.website) return { saved: false };
  await save(
    {
      kind: "RESOURCE",
      name: data.name,
      email: data.email,
      company: data.company,
      resource: data.resource,
      wantsUpdates: data.wantsUpdates,
    },
    meta,
    now,
  );
  return { saved: true };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** "Become a partner": kept for the platform admin and emailed to support. */
export async function applyAsPartner(input: unknown, meta: RequestMeta, now = new Date()) {
  const data = parseInput(partnerApplicationSchema, input);
  await limit(meta, now);
  if (data.website) return { saved: false };
  await save(
    {
      kind: "PARTNER",
      name: data.name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      partnerType: data.partnerType,
      message: data.message,
    },
    meta,
    now,
  );
  const to = env().SUPPORT_EMAIL;
  if (to) {
    const rows: [string, string][] = [
      ["Name", data.name],
      ["Email", data.email],
      ["Company", data.company],
      ["Phone", data.phone || "—"],
      ["Works as", data.partnerType],
      ["Message", data.message || "—"],
    ];
    // The subject is logged by the mail transport, so it carries no personal details.
    await deliver({
      to: [to],
      subject: "New partner application from the website",
      replyTo: data.email,
      text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
      html: `<p>A new partner application from the website:</p><table>${rows
        .map(([k, v]) => `<tr><th align="left">${k}</th><td>${escapeHtml(v)}</td></tr>`)
        .join("")}</table><p>Reply to this email to answer them.</p>`,
    }).catch((err: unknown) => reportError(err, "partner-application-email"));
  }
  return { saved: true };
}

export function listWebsiteLeads(
  _admin: PlatformActor,
  opts: { kind?: WebsiteLeadKind; includeHandled?: boolean } = {},
) {
  return asSystem(() =>
    db.websiteLead.findMany({
      where: {
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(opts.includeHandled ? {} : { handledAt: null }),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  );
}

export async function setWebsiteLeadHandled(
  admin: PlatformActor,
  id: string,
  handled: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that request.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const lead = await tx.websiteLead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundError("We couldn't find that request.");
      await tx.websiteLead.update({
        where: { id },
        data: handled
          ? { handledAt: now, handledById: admin.id }
          : { handledAt: null, handledById: null },
      });
      await writeAudit(
        {
          actor: { id: admin.id, name: admin.name, role: null },
          action: "platform.website_lead_handled",
          entityType: "WebsiteLead",
          entityId: id,
          metadata: { platform: true, handled },
          meta,
          accountId: null,
        },
        tx,
      );
    }),
  );
}

/** Housekeeping: remove requests and applications older than a year. */
export async function purgeOldWebsiteLeads(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - WEBSITE_LEAD_KEEP_DAYS * 86_400_000);
  const { count } = await asSystem(() =>
    db.websiteLead.deleteMany({ where: { createdAt: { lt: before } } }),
  );
  return count;
}
