import { beforeEach, describe, expect, it } from "vitest";

process.env.SUPPORT_EMAIL = "support@propfolio.example";

import { asSystem, db } from "@/server/db";
import {
  listDemoRequests,
  purgeOldDemoRequests,
  requestDemo,
  setDemoRequestHandled,
} from "@/server/demo/service";
import { ValidationError } from "@/server/errors";
import { logOutbox } from "@/server/mail/transport";
import type { PlatformActor } from "@/server/platform/auth";
import { meta, resetDb } from "./helpers";

beforeEach(resetDb);

const T0 = new Date("2026-11-11T02:00:00Z");
const admin: PlatformActor = {
  id: "0190f0a0-0000-7000-8000-000000000001",
  name: "Ana Admin",
  email: "ana@propfolio.example",
  sessionId: "s",
};

const form = (o: Record<string, unknown> = {}) => ({
  name: "Maria Santos",
  email: "Maria@Santos-Realty.example",
  company: "Santos Realty",
  phone: "0917 123 4567",
  units: "11–50",
  message: "We have <b>40</b> apartments.",
  website: "",
  ...o,
});

const auditRows = (action: string) =>
  asSystem(() => db.auditLog.findMany({ where: { action } }));

describe("Book a demo", () => {
  it("keeps the request, audits it without personal details and emails support", async () => {
    await requestDemo(form(), meta, T0);
    const rows = await listDemoRequests(admin);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Maria Santos",
      email: "maria@santos-realty.example",
      company: "Santos Realty",
      units: "11–50",
      handledAt: null,
    });
    const audit = await auditRows("demo.request");
    expect(audit).toHaveLength(1);
    const { metadata, changes } = audit[0]!;
    expect(JSON.stringify({ metadata, changes })).not.toMatch(/Maria|santos-realty/i);

    expect(logOutbox).toHaveLength(1);
    const mail = logOutbox[0]!;
    expect(mail.to).toEqual(["support@propfolio.example"]);
    expect(mail.replyTo).toBe("maria@santos-realty.example");
    expect(mail.subject).not.toMatch(/Maria|Santos/);
    expect(mail.html).toContain("&lt;b&gt;40&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>40</b>");
  });

  it.each([
    [{ name: "" }, "name"],
    [{ email: "not-an-email" }, "email"],
    [{ company: " " }, "company"],
    [{ units: "lots" }, "units"],
    [{ phone: "call me" }, "phone"],
  ])("refuses %o with a message on the %s field", async (bad, field) => {
    const err = await requestDemo(form(bad), meta, T0).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors).toHaveProperty(field);
    expect(await listDemoRequests(admin, { includeHandled: true })).toHaveLength(0);
  });

  it("quietly ignores bots that fill the hidden field", async () => {
    await expect(requestDemo(form({ website: "http://spam.example" }), meta, T0)).resolves.toEqual({
      saved: false,
    });
    expect(await listDemoRequests(admin, { includeHandled: true })).toHaveLength(0);
    expect(logOutbox).toHaveLength(0);
  });

  it("allows 5 requests an hour from one address", async () => {
    for (let i = 0; i < 5; i++) await requestDemo(form(), meta, T0);
    await expect(requestDemo(form(), meta, T0)).rejects.toThrow(/Too many requests/);
    const hourLater = new Date(T0.getTime() + 3601_000);
    await expect(requestDemo(form(), meta, hourLater)).resolves.toEqual({ saved: true });
  });

  it("the platform admin marks a request handled, and can undo it", async () => {
    await requestDemo(form(), meta, T0);
    const [r] = await listDemoRequests(admin);
    await setDemoRequestHandled(admin, r!.id, true, meta, T0);
    expect(await listDemoRequests(admin)).toHaveLength(0);
    expect(await listDemoRequests(admin, { includeHandled: true })).toHaveLength(1);
    await setDemoRequestHandled(admin, r!.id, false, meta, T0);
    expect(await listDemoRequests(admin)).toHaveLength(1);
    expect(await auditRows("platform.demo_request_handled")).toHaveLength(2);
    await expect(setDemoRequestHandled(admin, "nope", true, meta)).rejects.toThrow(/couldn't find/);
  });

  it("customer work can't read demo requests", async () => {
    await requestDemo(form(), meta, T0);
    // The test scope is the customer account here, as on any customer request.
    await expect(db.$transaction(async (tx) => tx.demoRequest.count())).rejects.toThrow(
      /permission denied/,
    );
  });

  it("removes requests after a year", async () => {
    await requestDemo(form(), meta, T0);
    expect(await purgeOldDemoRequests(new Date(T0.getTime() + 364 * 86_400_000))).toBe(0);
    expect(await purgeOldDemoRequests(new Date(T0.getTime() + 366 * 86_400_000))).toBe(1);
  });
});
