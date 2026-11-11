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
import { demoRequestSchema } from "@/schemas/demo";

/** Demo requests are kept for a year, then removed by the housekeeping job. */
export const DEMO_REQUEST_KEEP_DAYS = 365;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/**
 * Someone on the website asks for a demo: kept for the platform admin and emailed to support.
 * Anyone can call this, so it is rate-limited per address and ignores bots that fill the hidden
 * field (they get the same "thanks", so they learn nothing).
 */
export async function requestDemo(input: unknown, meta: RequestMeta, now = new Date()) {
  const data = parseInput(demoRequestSchema, input);
  const limit = await hitRateLimit("demoRequestByIp", meta.ipAddress, now);
  if (!limit.allowed) {
    throw new ValidationError(
      `Too many requests from here. Please wait ${waitText(limit.retryAfterSeconds)}, or email us.`,
    );
  }
  if (data.website) return { saved: false };

  await asSystem(() =>
    db.$transaction(async (tx) => {
      const r = await tx.demoRequest.create({
        data: {
          name: data.name,
          email: data.email,
          company: data.company,
          phone: data.phone,
          units: data.units,
          message: data.message,
          createdAt: now,
        },
      });
      await writeAudit(
        {
          actor: null,
          action: "demo.request",
          entityType: "DemoRequest",
          entityId: r.id,
          metadata: { units: data.units },
          meta,
          accountId: null,
        },
        tx,
      );
    }),
  );

  const to = env().SUPPORT_EMAIL;
  if (to) {
    const rows: [string, string][] = [
      ["Name", data.name],
      ["Email", data.email],
      ["Company", data.company],
      ["Phone", data.phone || "—"],
      ["Units", data.units],
      ["Message", data.message || "—"],
    ];
    // The subject is logged by the mail transport, so it carries no personal details.
    await deliver({
      to: [to],
      subject: "New demo request from the website",
      replyTo: data.email,
      text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
      html: `<p>A new demo request from the website:</p><table>${rows
        .map(([k, v]) => `<tr><th align="left">${k}</th><td>${escapeHtml(v)}</td></tr>`)
        .join("")}</table><p>Reply to this email to answer them.</p>`,
    }).catch((err: unknown) => reportError(err, "demo-request-email"));
  }
  return { saved: true };
}

export function listDemoRequests(_admin: PlatformActor, opts: { includeHandled?: boolean } = {}) {
  return asSystem(() =>
    db.demoRequest.findMany({
      where: opts.includeHandled ? {} : { handledAt: null },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  );
}

export async function setDemoRequestHandled(
  admin: PlatformActor,
  id: string,
  handled: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that request.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const r = await tx.demoRequest.findUnique({ where: { id } });
      if (!r) throw new NotFoundError("We couldn't find that request.");
      await tx.demoRequest.update({
        where: { id },
        data: handled
          ? { handledAt: now, handledById: admin.id }
          : { handledAt: null, handledById: null },
      });
      await writeAudit(
        {
          actor: { id: admin.id, name: admin.name, role: null },
          action: "platform.demo_request_handled",
          entityType: "DemoRequest",
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

/** Housekeeping: remove requests older than a year. */
export async function purgeOldDemoRequests(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - DEMO_REQUEST_KEEP_DAYS * 86_400_000);
  const { count } = await asSystem(() =>
    db.demoRequest.deleteMany({ where: { createdAt: { lt: before } } }),
  );
  return count;
}
