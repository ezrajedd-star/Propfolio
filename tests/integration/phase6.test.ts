import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";

import { recordPayment } from "@/server/billing/payments";
import { getCalendarEvents } from "@/server/calendar/service";
import { getDashboard } from "@/server/dashboard";
import {
  archiveDocument,
  documentLink,
  listDocuments,
  uploadDocument,
} from "@/server/documents/service";
import { storage, verifyLocalLink } from "@/server/documents/storage";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { listFeedback, sendFeedback, setFeedbackDone } from "@/server/feedback/service";
import { createLease, renewLease, terminateLease } from "@/server/leases/service";
import { getGuideState, saveGuideState } from "@/server/preferences";
import {
  anonymiseTenant,
  exportTenantData,
  purgePastRetention,
  recordsPastRetention,
} from "@/server/privacy/service";
import { listBuildings } from "@/server/property/buildings";
import { listUnits } from "@/server/property/units";
import { exportReport } from "@/server/reports/export";
import { runReport } from "@/server/reports/service";
import { updateSettings } from "@/server/settings/service";
import { auditActions, makeProperty, makeTenant, makeUser, meta, resetDb, terms } from "./helpers";

beforeEach(resetDb);
const asText = (v: unknown) =>
  JSON.stringify(v, (_, x: unknown) => (typeof x === "bigint" ? x.toString() : x));
const NOW = new Date("2026-04-10T02:00:00Z"); // 10 Apr 2026, Manila

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

async function setup() {
  const admin = await makeUser("ADMIN");
  const staff = await makeUser("LEASING_STAFF");
  const viewer = await makeUser("VIEWER");
  const { building, units, unitType } = await makeProperty(admin, { units: ["101", "102", "103"] });
  const tenant = await makeTenant(staff);
  const lease = await createLease(
    staff,
    {
      unitId: units[0]!.id,
      tenantId: tenant.id,
      ...terms({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        advanceRentType: "NONE",
        escalationType: "NONE",
      }),
    },
    meta,
    NOW,
  );
  return { admin, staff, viewer, building, units, unitType, tenant, lease };
}

describe("documents", () => {
  it("accept PDF/JPG/PNG/DOCX by content, store privately, and audit uploads and opens", async () => {
    const { staff, lease, tenant } = await setup();
    const doc = await uploadDocument(
      staff,
      { leaseId: lease.id, category: "SIGNED_CONTRACT" },
      { name: "C:\\scans\\Signed lease.PDF", bytes: PDF },
      meta,
    );
    expect(doc).toMatchObject({
      tenantId: tenant.id,
      fileName: "Signed lease.pdf",
      contentType: "application/pdf",
    });

    // Stored outside the web root, readable only through the storage layer.
    const file = path.resolve(env().STORAGE_DIR, doc.storageKey.slice(0, 2), doc.storageKey);
    expect((await stat(file)).mode & 0o077).toBe(0);
    expect(Buffer.from(await readFile(file)).equals(Buffer.from(PDF))).toBe(true);

    const link = await documentLink(staff, doc.id, meta, NOW);
    const u = new URL(link, "http://x");
    expect(u.pathname).toBe(`/api/v1/files/${doc.storageKey}`);
    const e = Number(u.searchParams.get("e"));
    expect(e - NOW.getTime() / 1000).toBe(300); // 5 minutes
    expect(verifyLocalLink(doc.storageKey, e, u.searchParams.get("s")!, NOW)).toBe(true);
    expect(verifyLocalLink(doc.storageKey, e, "forged", NOW)).toBe(false);
    expect(
      verifyLocalLink(
        doc.storageKey,
        e,
        u.searchParams.get("s")!,
        new Date(NOW.getTime() + 301_000),
      ),
    ).toBe(false);

    const actions = await auditActions(lease.id);
    expect(actions).toEqual(expect.arrayContaining(["document.upload", "document.download"]));
    // File names can hold personal data; the log doesn't copy them.
    const logged = await db.auditLog.findMany({ where: { action: { startsWith: "document." } } });
    expect(asText(logged)).not.toContain("Signed lease");

    // Tenant view lists the lease's documents too.
    const forTenant = await listDocuments(staff, { tenantId: tenant.id });
    expect(forTenant.rows.map((r) => r.leaseRefNo)).toEqual([lease.refNo]);
  });

  it.each([
    [
      "a program renamed to .pdf",
      new Uint8Array([0x4d, 0x5a, 0x90, 0]),
      "Only PDF, JPG, PNG or Word (DOCX)",
    ],
    ["an empty file", new Uint8Array(), "Choose a file"],
    ["a file over 20 MB", new Uint8Array(20 * 1024 * 1024 + 1).fill(0x25), "larger than 20 MB"],
  ])("reject %s", async (_, bytes, message) => {
    const { staff, lease } = await setup();
    const err = await uploadDocument(
      staff,
      { leaseId: lease.id, category: "OTHER" },
      { name: "x.pdf", bytes },
      meta,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(JSON.stringify((err as ValidationError).fieldErrors)).toContain(message);
  });

  it("are removed with a reason, never deleted", async () => {
    const { staff, tenant } = await setup();
    const doc = await uploadDocument(
      staff,
      { tenantId: tenant.id, category: "ID" },
      { name: "id.png", bytes: PNG },
      meta,
    );
    await expect(archiveDocument(staff, doc.id, { reason: "no" }, meta)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await archiveDocument(staff, doc.id, { reason: "Uploaded to the wrong tenant" }, meta);
    expect((await listDocuments(staff, { tenantId: tenant.id })).rows).toHaveLength(0);
    expect(
      (await listDocuments(staff, { tenantId: tenant.id }, { includeArchived: true })).rows[0],
    ).toMatchObject({
      archived: true,
      archiveReason: "Uploaded to the wrong tenant",
    });
    await expect(documentLink(staff, doc.id, meta)).rejects.toThrow("couldn't find");
  });
});

describe("reports", () => {
  it("all six run with filters, and totals match the overdue list", async () => {
    const { staff, units, tenant, lease, building } = await setup();
    await recordPayment(
      staff,
      {
        leaseId: lease.id,
        receivedDate: "2026-02-03",
        amount: "150000",
        method: "CHEQUE",
        reference: "CHK-1",
      },
      meta,
      NOW,
    );
    const old = await createLease(
      staff,
      {
        unitId: units[1]!.id,
        tenantId: tenant.id,
        ...terms({
          startDate: "2025-04-01",
          endDate: "2026-03-31",
          advanceRentType: "NONE",
          escalationType: "NONE",
        }),
      },
      meta,
      NOW,
    );
    await renewLease(
      staff,
      old.id,
      terms({
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        advanceRentType: "NONE",
        escalationType: "NONE",
      }),
      meta,
      NOW,
    );

    const expiry = await runReport(staff, "expiry", { days: 365 }, NOW);
    expect(expiry.rows.map((r) => r.refNo)).toContain(lease.refNo);

    const occ = await runReport(staff, "occupancy", { buildingId: building.id }, NOW);
    expect(occ.rows[0]).toMatchObject({ total: 3, occupied: 2, vacant: 1 });

    const roll = await runReport(staff, "rent-roll", {}, NOW);
    expect(roll.rows).toHaveLength(2);
    expect(roll.totals).toMatchObject({ monthlyRent: "100000.00", deposit: "200000.00" });

    const coll = await runReport(
      staff,
      "collections",
      { from: "2026-02-01", to: "2026-02-28" },
      NOW,
    );
    expect(coll.rows).toHaveLength(1);
    expect(coll.totals).toMatchObject({ amount: "150000.00" });
    expect(
      (await runReport(staff, "collections", { from: "2026-03-01", to: "2026-03-31" }, NOW)).rows,
    ).toHaveLength(0);

    const aging = await runReport(staff, "aging", {}, NOW);
    const overdue = await getDashboard(staff, NOW);
    expect(aging.totals?.total).toBe(overdue.leases?.overdueTotal);

    const ren = await runReport(staff, "renewals", { from: "2026-03-01", to: "2026-03-31" }, NOW);
    expect(ren.rows).toEqual([expect.objectContaining({ refNo: old.refNo, outcome: "Renewed" })]);
    expect(ren.highlights).toContainEqual({ label: "Renewal rate", value: "100%" });
  });

  it("export to Excel and CSV with the same rows, and every export is audited", async () => {
    const { staff } = await setup();
    const csv = await exportReport(staff, "rent-roll", {}, "csv", meta, NOW);
    expect(csv.body.toString("utf8")).toContain("Monthly rent");
    const xlsx = await exportReport(staff, "occupancy", {}, "xlsx", meta, NOW);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.getRow(1).getCell(1).value).toBe("Occupancy");
    const audits = await db.auditLog.findMany({
      where: { action: "data.export", entityType: "Report" },
    });
    expect(audits.map((a) => (a.metadata as { report: string }).report).sort()).toEqual([
      "occupancy",
      "rent-roll",
    ]);
  });
});

describe("privacy", () => {
  it("exports everything held about a tenant and audits it", async () => {
    const { admin, tenant, lease } = await setup();
    const data = await exportTenantData(admin, tenant.id, meta, NOW);
    expect(data.tenant).toMatchObject({
      displayName: "ABC Corporation",
      email: "maria@abc.example",
    });
    expect(data.leases[0]).toMatchObject({ reference: lease.refNo });
    expect(data.leases[0]!.charges.length).toBeGreaterThan(0);
    expect(await auditActions(tenant.id)).toContain("tenant.privacy_export");
  });

  it("anonymise: personal data and files go, money stays; blocked while a lease is current", async () => {
    const { admin, staff, tenant, lease } = await setup();
    await recordPayment(
      staff,
      {
        leaseId: lease.id,
        receivedDate: "2026-01-05",
        amount: "50000",
        method: "CASH",
        notes: "Paid by Maria",
      },
      meta,
      NOW,
    );
    const doc = await uploadDocument(
      staff,
      { leaseId: lease.id, category: "ID" },
      { name: "maria-id.png", bytes: PNG },
      meta,
    );

    await expect(
      anonymiseTenant(admin, tenant.id, { reason: "Tenant asked for erasure" }, meta, NOW),
    ).rejects.toThrow("current or future lease");
    await terminateLease(
      staff,
      lease.id,
      { terminationDate: "2026-04-09", reason: "Tenant moved out early" },
      meta,
      NOW,
    );
    await anonymiseTenant(admin, tenant.id, { reason: "Tenant asked for erasure" }, meta, NOW);

    const t = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(t).toMatchObject({ contactPerson: null, email: null, phone: null, searchText: "" });
    expect(t.displayName).toMatch(/^Anonymised tenant [0-9A-F]{6}$/);
    expect(t.anonymizedAt).not.toBeNull();
    const pay = await db.payment.findFirstOrThrow({ where: { leaseId: lease.id } });
    expect(pay).toMatchObject({ notes: null });
    expect(pay.amount.toFixed(2)).toBe("50000.00");
    const d = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(d.fileName).toBe("removed.png");
    expect(d.archivedAt).not.toBeNull();
    await expect(
      stat(path.resolve(env().STORAGE_DIR, doc.storageKey.slice(0, 2), doc.storageKey)),
    ).rejects.toThrow();
    await expect(storage().read!(doc.storageKey)).rejects.toThrow();

    await expect(
      anonymiseTenant(admin, tenant.id, { reason: "Again please" }, meta, NOW),
    ).rejects.toThrow("already");
    const log = await db.auditLog.findMany({ where: { action: "tenant.anonymize" } });
    expect(asText(log)).not.toContain("Maria");
  });

  it("lists tenants past retention and anonymises them all", async () => {
    const { admin, staff } = await setup();
    await updateSettings(admin, { retentionYears: 1 }, meta);
    const { units } = await makeProperty(admin, { units: ["9"] });
    const gone = await makeTenant(staff, "Old Tenant Inc.");
    await createLease(
      staff,
      {
        unitId: units[0]!.id,
        tenantId: gone.id,
        ...terms({
          startDate: "2023-01-01",
          endDate: "2024-12-31",
          advanceRentType: "NONE",
          escalationType: "NONE",
        }),
      },
      meta,
      NOW,
    );
    const due = await recordsPastRetention(admin, NOW);
    expect(due.rows.map((r) => r.name)).toEqual(["Old Tenant Inc."]);
    expect(due.rows[0]!.dueOn).toBe("2025-12-31");
    expect(await purgePastRetention(admin, meta, NOW)).toBe(1);
    expect((await recordsPastRetention(admin, NOW)).rows).toHaveLength(0);
    expect(await auditActions(gone.id)).toContain("retention.purge");
  });
});

describe("feedback and the guide", () => {
  it("feedback keeps the page path only; Admins list it and mark it done", async () => {
    const { admin, staff } = await setup();
    await sendFeedback(
      staff,
      { message: "Couldn't find the export button", pagePath: "/leases?q=maria#top" },
      meta,
    );
    await expect(
      sendFeedback(staff, { message: "no", pagePath: "/" }, meta),
    ).rejects.toBeInstanceOf(ValidationError);
    const [f] = await listFeedback(admin);
    expect(f).toMatchObject({ pagePath: "/leases", role: "LEASING_STAFF", status: "NEW" });
    await setFeedbackDone(admin, f!.id, true, meta);
    expect(await listFeedback(admin)).toHaveLength(0);
    expect(await listFeedback(admin, { includeDone: true })).toHaveLength(1);
    await expect(listFeedback(staff)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("guide state is saved per person", async () => {
    const { staff, viewer } = await setup();
    expect(await getGuideState(staff)).toEqual({ tourDone: false, on: false });
    await saveGuideState(staff, { tourDone: true });
    await saveGuideState(staff, { on: true, tourDone: "yes" });
    expect(await getGuideState(staff)).toEqual({ tourDone: true, on: true });
    expect(await getGuideState(viewer)).toEqual({ tourDone: false, on: false });
  });
});

describe("Viewers (Property Management)", () => {
  it("never receive tenant contact, financial or document data", async () => {
    const { staff, viewer, tenant, lease } = await setup();
    await recordPayment(
      staff,
      { leaseId: lease.id, receivedDate: "2026-01-05", amount: "12345.67", method: "CASH" },
      meta,
      NOW,
    );
    await uploadDocument(
      staff,
      { leaseId: lease.id, category: "ID" },
      { name: "secret.pdf", bytes: PDF },
      meta,
    );

    const responses = JSON.stringify([
      await getDashboard(viewer, NOW),
      await listBuildings(viewer, {}, NOW),
      await listUnits(viewer, {}, NOW),
      await getCalendarEvents(viewer, { from: "2025-12-15", to: "2027-01-15" }, NOW),
    ]);
    expect(responses).toContain(tenant.displayName); // names only
    for (const forbidden of [
      "maria@abc.example",
      "Maria Santos",
      "0917 123 4567",
      "50000",
      "12345.67",
      "secret.pdf",
      lease.refNo,
      "monthlyRent",
      "balanceDue",
      "overdue",
      "securityDeposit",
      "contactPerson",
      "email",
      "phone",
    ]) {
      expect(responses, forbidden).not.toContain(forbidden);
    }

    const refused = [
      listDocuments(viewer, { leaseId: lease.id }),
      documentLink(viewer, lease.id, meta),
      uploadDocument(viewer, {}, null, meta),
      runReport(viewer, "occupancy", {}),
      exportReport(viewer, "occupancy", {}, "csv", meta),
      exportTenantData(viewer, tenant.id, meta),
      anonymiseTenant(viewer, tenant.id, { reason: "testing it" }, meta),
      recordsPastRetention(viewer),
      listFeedback(viewer),
    ];
    for (const r of refused) await expect(r).rejects.toBeInstanceOf(ForbiddenError);
  });
});
