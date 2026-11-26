import { randomUUID } from "node:crypto";

import type { Prisma, TicketCategory, TicketStatus } from "@prisma/client";
import { render } from "@react-email/components";

import { detectDocumentType } from "@/domain/documents/file-type";
import { ticketAgeBucket } from "@/domain/platform/today";
import { nextTicketStatus, ticketNumber, ticketSubject } from "@/domain/tickets/tickets";
import { newTicketSchema, staffReplySchema, ticketReplySchema } from "@/schemas/tickets";
import { writeAudit } from "@/server/audit";
import { SUPPORT_REFUSED, type Actor } from "@/server/auth/authorize";
import { asSystem, db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { storage } from "@/server/documents/storage";
import { env } from "@/server/env";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { TicketReceivedEmail, TicketReplyEmail } from "@/server/mail/templates/ticket-emails";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import { reportError } from "@/server/monitoring/report-error";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import { hitRateLimit, waitText } from "@/server/rate-limit";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

/**
 * Support tickets from the in-app Help button. Customers see their own requests ("My
 * requests"); Propfolio staff answer in the console and replies go out by email (Brevo).
 * Staff-only notes are never shown or emailed to the customer.
 */

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export interface TicketDeps {
  send: (mail: OutgoingMail, fromName?: string) => Promise<void>;
}
const defaultDeps: TicketDeps = { send: deliver };

export interface Screenshot {
  bytes: Uint8Array;
  name: string;
}

async function storeScreenshot(file: Screenshot | null | undefined) {
  if (!file || file.bytes.length === 0) return null;
  if (file.bytes.length > MAX_SCREENSHOT_BYTES) {
    throw new ValidationError("Please check the screenshot.", {
      screenshot: "The screenshot is larger than 5 MB. Please send a smaller one.",
    });
  }
  const ext = detectDocumentType(file.bytes);
  if (ext !== "png" && ext !== "jpg") {
    throw new ValidationError("Please check the screenshot.", {
      screenshot: "Only PNG or JPG pictures can be attached.",
    });
  }
  const key = randomUUID();
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  await storage().put(key, file.bytes, contentType);
  return { attachmentKey: key, attachmentName: `screenshot.${ext}`, attachmentType: contentType };
}

function assertCustomer(actor: Actor) {
  if (actor.support) throw new ForbiddenError(SUPPORT_REFUSED);
}

async function limit(actor: Actor, now: Date) {
  const r = await hitRateLimit("ticketByUser", actor.id, now);
  if (!r.allowed) {
    throw new ValidationError(
      `You've sent a lot of messages in a short time. Please wait ${waitText(r.retryAfterSeconds)}.`,
    );
  }
}

const requestUrl = (id: string) => `${env().APP_URL}/requests/${id}`;

async function email(
  deps: TicketDeps,
  to: string,
  subject: string,
  element: React.ReactElement,
  where: string,
): Promise<boolean> {
  try {
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    const replyTo = env().SUPPORT_EMAIL;
    await deps.send(
      { to: [to], subject, html, text, ...(replyTo ? { replyTo } : {}) },
      "Propfolio support",
    );
    return true;
  } catch (err) {
    reportError(err, where);
    return false;
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────────────────

/** "Help": a new request, linked to the account and the person. Anyone in an account can ask. */
export async function createTicket(
  actor: Actor,
  input: unknown,
  screenshot: Screenshot | null,
  meta: RequestMeta,
  now = new Date(),
  deps: TicketDeps = defaultDeps,
) {
  assertCustomer(actor);
  const data = parseInput(newTicketSchema, input);
  await limit(actor, now);
  const attachment = await storeScreenshot(screenshot);
  const ticket = await asSystem(() =>
    db.$transaction(async (tx) => {
      const t = await tx.ticket.create({
        data: {
          accountId: actor.accountId,
          userId: actor.id,
          subject: ticketSubject(data.description),
          category: data.category,
          language: data.language,
          pagePath: data.pagePath ?? null,
          lastCustomerMessageAt: now,
          createdAt: now,
          messages: {
            create: {
              author: "CUSTOMER",
              authorId: actor.id,
              authorName: actor.name,
              body: data.description,
              createdAt: now,
              ...(attachment ?? {}),
            },
          },
        },
      });
      await writeAudit(
        {
          actor,
          action: "ticket.created",
          entityType: "Ticket",
          entityId: t.id,
          metadata: { number: ticketNumber(t.number), category: t.category },
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
      return t;
    }),
  );
  const number = ticketNumber(ticket.number);
  await email(
    deps,
    actor.email,
    `We got your request ${number}`,
    <TicketReceivedEmail
      name={actor.name}
      number={number}
      subject={ticket.subject}
      url={requestUrl(ticket.id)}
    />,
    "ticket-received-email",
  );
  const inbox = env().SUPPORT_EMAIL;
  if (inbox) {
    // Our own inbox: a nudge with a console link, no customer details in the subject.
    await deps
      .send({
        to: [inbox],
        subject: `New help request ${number}`,
        text: `A new help request is waiting: ${env().APP_URL}/platform/tickets/${ticket.id}`,
        html: `<p>A new help request is waiting: <a href="${env().APP_URL}/platform/tickets/${ticket.id}">${number}</a></p>`,
      })
      .catch((err: unknown) => reportError(err, "ticket-inbox-email"));
  }
  return { id: ticket.id, number };
}

/** "My requests": the person's own tickets, newest first. */
export async function listMyTickets(actor: Actor) {
  return asSystem(() =>
    db.ticket.findMany({
      where: { accountId: actor.accountId, userId: actor.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        category: true,
        createdAt: true,
        lastReplyAt: true,
      },
    }),
  );
}

async function ownTicket(actor: Actor, id: string) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that request.");
  const t = await db.ticket.findFirst({
    where: { id, accountId: actor.accountId, userId: actor.id },
  });
  if (!t) throw new NotFoundError("We couldn't find that request.");
  return t;
}

/** One of the person's requests, without staff-only notes. */
export async function getMyTicket(actor: Actor, id: string) {
  return asSystem(async () => {
    const t = await ownTicket(actor, id);
    const messages = await db.ticketMessage.findMany({
      where: { ticketId: t.id, internal: false },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        author: true,
        authorName: true,
        body: true,
        createdAt: true,
        attachmentKey: true,
      },
    });
    return {
      ...t,
      messages: messages.map(({ attachmentKey, ...m }) => ({
        ...m,
        hasScreenshot: !!attachmentKey,
      })),
    };
  });
}

/** The customer adds to their request (a resolved one opens again). */
export async function replyToMyTicket(
  actor: Actor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCustomer(actor);
  const { body } = parseInput(ticketReplySchema, input);
  await limit(actor, now);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const t = await ownTicket(actor, id);
      await tx.ticketMessage.create({
        data: {
          ticketId: t.id,
          author: "CUSTOMER",
          authorId: actor.id,
          authorName: actor.name,
          body,
          createdAt: now,
        },
      });
      await tx.ticket.update({
        where: { id: t.id },
        data: {
          status: nextTicketStatus(t.status, "customer_message"),
          lastCustomerMessageAt: now,
          resolvedAt: null,
        },
      });
      await writeAudit(
        {
          actor,
          action: "ticket.replied",
          entityType: "Ticket",
          entityId: t.id,
          metadata: { number: ticketNumber(t.number) },
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
    }),
  );
}

/** A screenshot on the person's own request. */
export async function myScreenshot(actor: Actor, messageId: string) {
  if (!isUuid(messageId)) throw new NotFoundError("We couldn't find that picture.");
  const m = await asSystem(() =>
    db.ticketMessage.findFirst({
      where: {
        id: messageId,
        internal: false,
        ticket: { accountId: actor.accountId, userId: actor.id },
      },
    }),
  );
  if (!m?.attachmentKey || !m.attachmentType)
    throw new NotFoundError("We couldn't find that picture.");
  return {
    key: m.attachmentKey,
    contentType: m.attachmentType,
    fileName: m.attachmentName ?? "screenshot",
  };
}

// ─── Propfolio staff ─────────────────────────────────────────────────────────────────────

export interface TicketFilters {
  status?: TicketStatus | "OPEN";
  category?: TicketCategory;
}

export async function listTickets(admin: PlatformActor, filters: TicketFilters = {}) {
  assertPlatformCan(admin, "tickets.view");
  const where: Prisma.TicketWhereInput = {
    ...(filters.status === "OPEN"
      ? { status: { not: "RESOLVED" } }
      : filters.status
        ? { status: filters.status }
        : {}),
    ...(filters.category ? { category: filters.category } : {}),
  };
  return asSystem(async () => {
    const tickets = await db.ticket.findMany({
      where,
      orderBy: [{ lastCustomerMessageAt: "asc" }],
      take: 300,
    });
    const [accounts, users] = await Promise.all([
      db.account.findMany({
        where: { id: { in: [...new Set(tickets.map((t) => t.accountId))] } },
        select: { id: true, name: true },
      }),
      db.user.findMany({
        where: { id: { in: [...new Set(tickets.map((t) => t.userId))] } },
        select: { id: true, name: true },
      }),
    ]);
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const userName = new Map(users.map((u) => [u.id, u.name]));
    return tickets.map((t) => ({
      ...t,
      accountName: accountName.get(t.accountId) ?? "—",
      customerName: userName.get(t.userId) ?? "—",
    }));
  });
}

/** One ticket with the whole conversation (staff notes included). The view is logged. */
export async function getTicket(admin: PlatformActor, id: string, meta: RequestMeta | null = null) {
  assertPlatformCan(admin, "tickets.view");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that ticket.");
  return asSystem(async () => {
    const t = await db.ticket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!t) throw new NotFoundError("We couldn't find that ticket.");
    const [account, user] = await Promise.all([
      db.account.findUnique({
        where: { id: t.accountId },
        select: { id: true, name: true, plan: true },
      }),
      db.user.findUnique({ where: { id: t.userId }, select: { name: true, email: true } }),
    ]);
    await writeStaffLog({
      actor: admin,
      kind: "VIEW",
      action: "ticket.viewed",
      entityType: "Ticket",
      entityId: t.id,
      accountId: t.accountId,
      meta,
    });
    return {
      ...t,
      account,
      customer: user,
      messages: t.messages.map(({ attachmentKey, ...m }) => ({
        ...m,
        hasScreenshot: !!attachmentKey,
      })),
    };
  });
}

/**
 * Staff answer a ticket (emailed to the customer) or add a staff-only note. Optionally marks it
 * resolved at the same time.
 */
export async function replyToTicket(
  admin: PlatformActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  deps: TicketDeps = defaultDeps,
) {
  assertPlatformCan(admin, "tickets.manage");
  const data = parseInput(staffReplySchema, input);
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that ticket.");
  const { ticket, messageId } = await asSystem(() =>
    db.$transaction(async (tx) => {
      const t = await tx.ticket.findUnique({ where: { id } });
      if (!t) throw new NotFoundError("We couldn't find that ticket.");
      const m = await tx.ticketMessage.create({
        data: {
          ticketId: t.id,
          author: "STAFF",
          authorId: admin.id,
          authorName: admin.name,
          body: data.body,
          internal: data.internal,
          createdAt: now,
        },
      });
      let status = nextTicketStatus(t.status, data.internal ? "staff_note" : "staff_reply");
      if (data.resolve) status = "RESOLVED";
      await tx.ticket.update({
        where: { id: t.id },
        data: {
          status,
          ...(data.internal ? {} : { lastReplyAt: now }),
          resolvedAt: status === "RESOLVED" ? now : null,
        },
      });
      await writeStaffLog(
        {
          actor: admin,
          kind: "CHANGE",
          action: data.internal ? "ticket.note_added" : "ticket.replied",
          entityType: "Ticket",
          entityId: t.id,
          accountId: t.accountId,
          metadata: { status },
          meta,
        },
        tx,
      );
      return { ticket: { ...t, status }, messageId: m.id };
    }),
  );
  if (data.internal) return { emailed: false };
  const customer = await asSystem(() =>
    db.user.findUnique({ where: { id: ticket.userId }, select: { name: true, email: true } }),
  );
  if (!customer) return { emailed: false };
  const number = ticketNumber(ticket.number);
  const sent = await email(
    deps,
    customer.email,
    `Reply to your request ${number}`,
    <TicketReplyEmail
      name={customer.name}
      number={number}
      reply={data.body}
      from={admin.name.split(" ")[0] ?? admin.name}
      url={requestUrl(ticket.id)}
      resolved={ticket.status === "RESOLVED"}
    />,
    "ticket-reply-email",
  );
  if (sent) {
    await asSystem(() =>
      db.ticketMessage.update({ where: { id: messageId }, data: { emailedAt: now } }),
    );
  }
  return { emailed: sent };
}

/** Mark resolved, or open again. */
export async function setTicketResolved(
  admin: PlatformActor,
  id: string,
  resolved: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "tickets.manage");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that ticket.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const t = await tx.ticket.findUnique({ where: { id } });
      if (!t) throw new NotFoundError("We couldn't find that ticket.");
      const status = nextTicketStatus(t.status, resolved ? "resolve" : "reopen");
      await tx.ticket.update({
        where: { id },
        data: { status, resolvedAt: resolved ? now : null },
      });
      await writeStaffLog(
        {
          actor: admin,
          kind: "CHANGE",
          action: resolved ? "ticket.resolved" : "ticket.reopened",
          entityType: "Ticket",
          entityId: id,
          accountId: t.accountId,
          meta,
        },
        tx,
      );
    }),
  );
}

export async function staffScreenshot(admin: PlatformActor, messageId: string, meta: RequestMeta) {
  assertPlatformCan(admin, "tickets.view");
  if (!isUuid(messageId)) throw new NotFoundError("We couldn't find that picture.");
  return asSystem(async () => {
    const m = await db.ticketMessage.findUnique({
      where: { id: messageId },
      include: { ticket: { select: { accountId: true } } },
    });
    if (!m?.attachmentKey || !m.attachmentType)
      throw new NotFoundError("We couldn't find that picture.");
    await writeStaffLog({
      actor: admin,
      kind: "EXPORT",
      action: "ticket.screenshot_opened",
      entityType: "TicketMessage",
      entityId: m.id,
      accountId: m.ticket.accountId,
      meta,
    });
    return {
      key: m.attachmentKey,
      contentType: m.attachmentType,
      fileName: m.attachmentName ?? "screenshot",
    };
  });
}

/** Open tickets by how long ago they were opened (the Today page). */
export async function openTicketCounts(now = new Date()) {
  const open = await asSystem(() =>
    db.ticket.findMany({ where: { status: { not: "RESOLVED" } }, select: { createdAt: true } }),
  );
  const counts = { open: open.length, under1d: 0, oneTo3d: 0, over3d: 0 };
  for (const t of open) {
    const b = ticketAgeBucket(t.createdAt, now);
    if (b === "under1d") counts.under1d += 1;
    else if (b === "1to3d") counts.oneTo3d += 1;
    else counts.over3d += 1;
  }
  return counts;
}

/**
 * A reply drafted by the Support agent, sent after approval (or straight away under "Act").
 * Shown to the customer as from Propfolio support; the staff view says the agent drafted it.
 */
export async function postAgentReply(
  ticketId: string,
  body: string,
  opts: { approvedByName?: string | null; resolve?: boolean },
  now = new Date(),
  deps: TicketDeps = defaultDeps,
): Promise<{ emailed: boolean }> {
  const ticket = await asSystem(() =>
    db.$transaction(async (tx) => {
      const t = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!t) throw new NotFoundError("We couldn't find that ticket.");
      const m = await tx.ticketMessage.create({
        data: {
          ticketId,
          author: "AGENT",
          authorName: opts.approvedByName
            ? `Propfolio support (checked by ${opts.approvedByName})`
            : "Propfolio support",
          body,
          createdAt: now,
        },
      });
      const status = opts.resolve ? "RESOLVED" : nextTicketStatus(t.status, "staff_reply");
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status, lastReplyAt: now, resolvedAt: status === "RESOLVED" ? now : null },
      });
      return { ...t, status, messageId: m.id };
    }),
  );
  const customer = await asSystem(() =>
    db.user.findUnique({ where: { id: ticket.userId }, select: { name: true, email: true } }),
  );
  if (!customer) return { emailed: false };
  const number = ticketNumber(ticket.number);
  const sent = await email(
    deps,
    customer.email,
    `Reply to your request ${number}`,
    <TicketReplyEmail
      name={customer.name}
      number={number}
      reply={body}
      from="Propfolio support"
      url={requestUrl(ticket.id)}
      resolved={ticket.status === "RESOLVED"}
    />,
    "ticket-agent-reply-email",
  );
  if (sent) {
    await asSystem(() =>
      db.ticketMessage.update({ where: { id: ticket.messageId }, data: { emailedAt: now } }),
    );
  }
  return { emailed: sent };
}

/** The Support agent hands a ticket to a person: a staff-only note with what it found. */
export async function addAgentNote(ticketId: string, body: string, now = new Date()) {
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const t = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!t) throw new NotFoundError("We couldn't find that ticket.");
      await tx.ticketMessage.create({
        data: {
          ticketId,
          author: "AGENT",
          authorName: "Support agent",
          body,
          internal: true,
          createdAt: now,
        },
      });
      if (t.status === "NEW") {
        await tx.ticket.update({ where: { id: ticketId }, data: { status: "WAITING_ON_US" } });
      }
    }),
  );
}
