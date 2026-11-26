process.env.SUPPORT_EMAIL = "support@propfolio.example";

import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/server/auth/authorize";
import { asSystem, db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import type { OutgoingMail } from "@/server/mail/transport";
import { getTodayMetrics } from "@/server/platform/today";
import {
  createTicket,
  getMyTicket,
  getTicket,
  listMyTickets,
  listTickets,
  myScreenshot,
  replyToMyTicket,
  replyToTicket,
  setTicketResolved,
  staffScreenshot,
} from "@/server/tickets/service";
import { makeStaff, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-11-26T02:00:00Z");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function mailbox() {
  const sent: OutgoingMail[] = [];
  return { sent, deps: { send: async (m: OutgoingMail) => void sent.push(m) } };
}

const ask = (actor: Actor, box = mailbox(), screenshot: Uint8Array | null = null) =>
  createTicket(
    actor,
    {
      category: "BUG",
      language: "TL",
      description: "The calendar doesn't show my renewed lease.\nIt worked last week.",
      pagePath: "/calendar",
    },
    screenshot ? { bytes: screenshot, name: "s.png" } : null,
    meta,
    NOW,
    box.deps,
  );

describe("customers ask for help", () => {
  it("anyone in an account can ask; they get a confirmation and support gets a nudge", async () => {
    const viewer = await makeUser("VIEWER", { name: "Vic" });
    const box = mailbox();
    const t = await ask(viewer, box);
    // Production numbers start at T-1001; the test database restarts its counters.
    expect(t.number).toMatch(/^T-\d+$/);
    expect(box.sent.map((m) => m.subject)).toEqual([
      `We got your request ${t.number}`,
      `New help request ${t.number}`,
    ]);
    expect(box.sent[0]!.to).toEqual([viewer.email]);
    // Our inbox nudge carries no customer details.
    expect(box.sent[1]!.text).not.toMatch(/calendar|Vic/);
    const row = await asSystem(() => db.ticket.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row).toMatchObject({
      subject: "The calendar doesn't show my renewed lease.",
      category: "BUG",
      language: "TL",
      status: "NEW",
      pagePath: "/calendar",
    });
    expect(await asSystem(() => db.auditLog.count({ where: { action: "ticket.created" } }))).toBe(
      1,
    );
  });

  it("checks the description and the screenshot", async () => {
    const user = await makeUser("LEASING_STAFF");
    await expect(
      createTicket(
        user,
        { category: "BUG", description: "short" },
        null,
        meta,
        NOW,
        mailbox().deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    await expect(ask(user, mailbox(), gif)).rejects.toThrow(/screenshot/i);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    await expect(ask(user, mailbox(), big)).rejects.toThrow(/screenshot/i);
  });

  it("Propfolio support in support mode can't open tickets as the customer", async () => {
    const user = await makeUser("ADMIN");
    const supportActor = {
      ...user,
      support: { adminId: "x", adminName: "Sam", grantId: "g", accessEndsAt: NOW },
    };
    await expect(ask(supportActor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("people see only their own requests, never staff notes", async () => {
    const asker = await makeUser("LEASING_STAFF");
    const colleague = await makeUser("ADMIN");
    const t = await ask(asker);
    const staff = await makeStaff("PLATFORM_SUPPORT");
    await replyToTicket(
      staff,
      t.id,
      { body: "Internal: check sync job", internal: true },
      meta,
      NOW,
      mailbox().deps,
    );
    expect(await listMyTickets(colleague)).toHaveLength(0);
    await expect(getMyTicket(colleague, t.id)).rejects.toBeInstanceOf(NotFoundError);
    const mine = await getMyTicket(asker, t.id);
    expect(mine.messages).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toMatch(/check sync job/);
  });

  it("screenshots are visible to the asker and to staff (logged), nobody else", async () => {
    const asker = await makeUser("LEASING_STAFF");
    const other = await makeUser("LEASING_STAFF");
    const t = await ask(asker, mailbox(), PNG);
    const mine = await getMyTicket(asker, t.id);
    const messageId = mine.messages[0]!.id;
    expect(mine.messages[0]!.hasScreenshot).toBe(true);
    expect((await myScreenshot(asker, messageId)).contentType).toBe("image/png");
    await expect(myScreenshot(other, messageId)).rejects.toBeInstanceOf(NotFoundError);
    const ro = await makeStaff("PLATFORM_READONLY");
    await staffScreenshot(ro, messageId, meta);
    expect(
      await asSystem(() => db.staffLog.count({ where: { action: "ticket.screenshot_opened" } })),
    ).toBe(1);
  });
});

describe("staff answer tickets", () => {
  it("a reply is emailed with its text; the status moves to waiting on the customer", async () => {
    const asker = await makeUser("OWNER", { name: "Olive Owner" });
    const t = await ask(asker);
    const staff = await makeStaff("PLATFORM_SUPPORT", "Sam Santos");
    const box = mailbox();
    expect(
      await replyToTicket(
        staff,
        t.id,
        { body: "Please refresh the calendar." },
        meta,
        NOW,
        box.deps,
      ),
    ).toEqual({ emailed: true });
    expect(box.sent[0]!.to).toEqual([asker.email]);
    expect(box.sent[0]!.subject).toBe(`Reply to your request ${t.number}`);
    expect(box.sent[0]!.text).toMatch(/Please refresh the calendar/);
    expect(box.sent[0]!.replyTo).toBe("support@propfolio.example");
    const row = await asSystem(() => db.ticket.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row.status).toBe("WAITING_ON_CUSTOMER");
    // The customer replies: back to us.
    await replyToMyTicket(asker, t.id, { body: "Still not there." }, meta, NOW);
    expect((await getMyTicket(asker, t.id)).status).toBe("WAITING_ON_US");
  });

  it("staff notes aren't emailed; resolving and reopening work; a customer reply reopens", async () => {
    const asker = await makeUser("LEASING_STAFF");
    const t = await ask(asker);
    const staff = await makeStaff("PLATFORM_SUPPORT");
    const box = mailbox();
    expect(
      await replyToTicket(staff, t.id, { body: "note", internal: true }, meta, NOW, box.deps),
    ).toEqual({ emailed: false });
    expect(box.sent).toHaveLength(0);
    await replyToTicket(staff, t.id, { body: "Fixed!", resolve: true }, meta, NOW, box.deps);
    expect((await getMyTicket(asker, t.id)).status).toBe("RESOLVED");
    expect(box.sent[0]!.text).toMatch(/marked this request as resolved/);
    await replyToMyTicket(asker, t.id, { body: "Not fixed" }, meta, NOW);
    expect((await getMyTicket(asker, t.id)).status).toBe("WAITING_ON_US");
    await setTicketResolved(staff, t.id, true, meta, NOW);
    await setTicketResolved(staff, t.id, false, meta, NOW);
    expect((await getMyTicket(asker, t.id)).status).toBe("WAITING_ON_US");
    const actions = (await asSystem(() => db.staffLog.findMany({ orderBy: { seq: "asc" } }))).map(
      (r) => r.action,
    );
    expect(actions).toEqual([
      "ticket.note_added",
      "ticket.replied",
      "ticket.resolved",
      "ticket.reopened",
    ]);
  });

  it("read-only staff can look but not answer; viewing a ticket is logged", async () => {
    const asker = await makeUser("LEASING_STAFF");
    const t = await ask(asker);
    const ro = await makeStaff("PLATFORM_READONLY");
    expect((await listTickets(ro)).map((x) => x.id)).toEqual([t.id]);
    const full = await getTicket(ro, t.id, meta);
    expect(full.customer?.email).toBe(asker.email);
    expect(await asSystem(() => db.staffLog.count({ where: { action: "ticket.viewed" } }))).toBe(1);
    await expect(
      replyToTicket(ro, t.id, { body: "hi" }, meta, NOW, mailbox().deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setTicketResolved(ro, t.id, true, meta)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("filters by status and category, and Today counts open tickets by age", async () => {
    const asker = await makeUser("LEASING_STAFF");
    const a = await ask(asker);
    await createTicket(
      asker,
      { category: "BILLING", description: "Please send my receipt for October." },
      null,
      meta,
      new Date(NOW.getTime() - 4 * 86_400_000),
      mailbox().deps,
    );
    const staff = await makeStaff("PLATFORM_SUPPORT");
    expect(await listTickets(staff, { status: "OPEN" })).toHaveLength(2);
    expect(await listTickets(staff, { category: "BILLING" })).toHaveLength(1);
    expect((await getTodayMetrics(staff, NOW)).tickets).toEqual({
      open: 2,
      under1d: 1,
      oneTo3d: 0,
      over3d: 1,
    });
    await setTicketResolved(staff, a.id, true, meta, NOW);
    expect(await listTickets(staff, { status: "RESOLVED" })).toHaveLength(1);
  });
});
