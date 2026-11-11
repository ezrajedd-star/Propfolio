import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";

process.env.SUPPORT_EMAIL = "support@propfolio.example";

import { asSystem, db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { logOutbox } from "@/server/mail/transport";
import type { PlatformActor } from "@/server/platform/auth";
import { getSystemStatus } from "@/server/status";
import { leaseTrackerWorkbook } from "@/server/website-leads/lease-tracker";
import {
  applyAsPartner,
  listWebsiteLeads,
  purgeOldWebsiteLeads,
  requestResource,
  setWebsiteLeadHandled,
} from "@/server/website-leads/service";
import { meta, resetDb } from "./helpers";

beforeEach(resetDb);

const T0 = new Date("2026-11-11T02:00:00Z");
const admin: PlatformActor = {
  id: "0190f0a0-0000-7000-8000-000000000001",
  name: "Ana Admin",
  email: "ana@propfolio.example",
  sessionId: "s",
};

const resource = (o: Record<string, unknown> = {}) => ({
  name: "Lito Lessor",
  email: "Lito@Example.com",
  resource: "lease-tracker",
  wantsUpdates: true,
  website: "",
  ...o,
});
const partner = (o: Record<string, unknown> = {}) => ({
  name: "Bea Broker",
  email: "bea@broker.example",
  company: "Bea Realty",
  phone: "",
  partnerType: "Real estate broker",
  message: "I place <i>20</i> tenants a month.",
  website: "",
  ...o,
});

describe("free resources", () => {
  it("keeps who asked, without emailing support", async () => {
    await requestResource(resource(), meta, T0);
    const [lead] = await listWebsiteLeads(admin, { kind: "RESOURCE" });
    expect(lead).toMatchObject({
      email: "lito@example.com",
      wantsUpdates: true,
      resource: "lease-tracker",
    });
    expect(logOutbox).toHaveLength(0);
    const audit = await asSystem(() =>
      db.auditLog.findMany({ where: { action: "website.resource_request" } }),
    );
    expect(JSON.stringify(audit[0]!.metadata)).not.toMatch(/Lito|example\.com/i);
  });

  it("refuses an unknown resource and a missing email", async () => {
    for (const bad of [{ resource: "secrets" }, { email: "" }]) {
      await expect(requestResource(resource(bad), meta, T0)).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
  });

  it("ignores bots and limits each address to 10 an hour", async () => {
    await expect(requestResource(resource({ website: "x" }), meta, T0)).resolves.toEqual({
      saved: false,
    });
    for (let i = 0; i < 9; i++) await requestResource(resource(), meta, T0);
    await expect(requestResource(resource(), meta, T0)).rejects.toThrow(/Too many requests/);
    expect(await listWebsiteLeads(admin, { kind: "RESOURCE" })).toHaveLength(9);
  });

  it("the lease tracker works out days left and what to do", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      (await leaseTrackerWorkbook("https://propfolio.example")) as unknown as ArrayBuffer,
    );
    const ws = wb.getWorksheet("Leases")!;
    expect(ws.getRow(1).values).toContain("Days left");
    expect((ws.getCell("I2").value as { formula: string }).formula).toBe('IF(E2="","",E2-TODAY())');
    expect((ws.getCell("J201").value as { formula: string }).formula).toContain(
      "Talk to the tenant",
    );
    expect(String(wb.getWorksheet("Read me")!.getCell("A9").value)).toContain(
      "https://propfolio.example/signup",
    );
  });
});

describe("partner applications", () => {
  it("keeps the application and emails support, escaping what they wrote", async () => {
    await applyAsPartner(partner(), meta, T0);
    expect(await listWebsiteLeads(admin, { kind: "PARTNER" })).toHaveLength(1);
    expect(await listWebsiteLeads(admin, { kind: "RESOURCE" })).toHaveLength(0);
    const mail = logOutbox[0]!;
    expect(mail.subject).not.toMatch(/Bea/);
    expect(mail.replyTo).toBe("bea@broker.example");
    expect(mail.html).toContain("&lt;i&gt;20&lt;/i&gt;");
  });

  it("asks what they do", async () => {
    const err = await applyAsPartner(partner({ partnerType: "Spy" }), meta, T0).catch(
      (e: unknown) => e,
    );
    expect((err as ValidationError).fieldErrors).toHaveProperty("partnerType");
  });

  it("the platform admin marks it handled and can undo; customers can't read it", async () => {
    await applyAsPartner(partner(), meta, T0);
    const [lead] = await listWebsiteLeads(admin, { kind: "PARTNER" });
    await setWebsiteLeadHandled(admin, lead!.id, true, meta, T0);
    expect(await listWebsiteLeads(admin, { kind: "PARTNER" })).toHaveLength(0);
    await setWebsiteLeadHandled(admin, lead!.id, false, meta, T0);
    expect(await listWebsiteLeads(admin, { kind: "PARTNER" })).toHaveLength(1);
    await expect(db.$transaction(async (tx) => tx.websiteLead.count())).rejects.toThrow(
      /permission denied/,
    );
  });

  it("removes everything after a year", async () => {
    await applyAsPartner(partner(), meta, T0);
    await requestResource(resource(), meta, T0);
    expect(await purgeOldWebsiteLeads(new Date(T0.getTime() + 366 * 86_400_000))).toBe(2);
  });
});

describe("status page", () => {
  it("shows the database working and no reminder data on a new install", async () => {
    const s = await getSystemStatus(T0);
    expect(s.map((x) => [x.name, x.state])).toEqual([
      ["Website and app", "ok"],
      ["Database", "ok"],
      ["Daily reminder emails", "unknown"],
    ]);
  });
});
