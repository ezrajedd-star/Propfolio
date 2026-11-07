import ExcelJS from "exceljs";

import { unitLimitMessage } from "@/domain/plans/plans";
import {
  IMPORT_COLUMNS,
  IMPORT_SHEETS,
  checkImport,
  importTenantKey,
  importUnitKey,
  type ImportCheck,
  type ImportContext,
  type ImportError,
  type ImportPlan,
  type RawRow,
  type RawWorkbook,
} from "@/domain/import/rows";
import { fromDbDate } from "@/domain/time/calendar-date";
import { writeAudit } from "@/server/audit";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { createLease, setLeaseArchived } from "@/server/leases/service";
import { createBuilding, setBuildingArchived } from "@/server/property/buildings";
import { createUnit, setUnitArchived } from "@/server/property/units";
import type { RequestMeta } from "@/server/request-meta";
import { createTenant, setTenantArchived } from "@/server/tenants/service";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface ImportFile {
  name: string;
  bytes: Uint8Array;
}

/** Everyone who imports must be allowed to add buildings, units, tenants and leases. */
function assertCanImport(actor: Actor) {
  assertCan(actor, "property.manage");
  assertCan(actor, "tenant.edit");
  assertCan(actor, "lease.edit");
}

const EXAMPLES: Record<string, string[]> = {
  Buildings: ["TWR1", "Tower One", "6789 Ayala Ave, Makati", "Commercial"],
  Units: ["TWR1", "1201", "Office", "12", "85.5"],
  Tenants: [
    "ABC Corporation",
    "Company",
    "Maria Santos",
    "0917 123 4567",
    "ap@abc.example",
    "Unit 5, 123 Rizal St, Pasig",
    "123-456-789-000",
    "Signed form",
  ],
  Leases: [
    "TWR1",
    "1201",
    "ABC Corporation",
    "2026-01-01",
    "2027-12-31",
    "50000",
    "5",
    "100000",
    "2",
    "5",
    "12",
  ],
};

/** The template: one sheet per kind of record, with the columns in order, and a "Read me". */
export async function importTemplate(actor: Actor): Promise<Buffer> {
  assertCanImport(actor);
  const unitTypes = await db.unitType.findMany({
    where: { archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { name: true },
  });
  const wb = new ExcelJS.Workbook();
  const readMe = wb.addWorksheet("Read me");
  readMe.columns = [{ width: 110 }];
  const lines = [
    "How to import into Propfolio",
    "",
    "1. Fill in the sheets Buildings, Units, Tenants and Leases: one row per record, starting on row 2. Leave a sheet empty if you have nothing for it.",
    "2. Columns marked * are required. Don't rename or reorder the columns.",
    "3. Units refer to their building by its code; leases refer to a unit (building code + unit number) and a tenant (its exact name).",
    "   They can refer to records in this file or already in Propfolio.",
    "4. Dates: type them as 2026-01-31 (year-month-day), or use Excel dates. Money: just the number, like 50000 or 50,000.50.",
    `5. Unit types you can use: ${unitTypes.map((t) => t.name).join(", ")}.`,
    "6. Building types: Commercial, Residential, Industrial complex, Mixed use. Tenants: Company or Individual.",
    "7. Privacy notice given: Signed form, Email or In person. Every tenant must have received your privacy notice.",
    "8. Leases: Advance rent is a number of months (or leave empty). Yearly increase is a percentage, applied every 12 months unless you say otherwise.",
    "9. Upload the file in Propfolio. You'll see every problem, row by row, and nothing is saved until the whole file is right.",
    "",
    "Example rows (don't copy them into the sheets unless they're yours):",
    ...IMPORT_SHEETS.map((s) => `${s}: ${EXAMPLES[s]!.join(" | ")}`),
  ];
  lines.forEach((l, i) => {
    readMe.getCell(i + 1, 1).value = l;
  });
  readMe.getRow(1).font = { bold: true, size: 14 };
  for (const s of IMPORT_SHEETS) {
    const ws = wb.addWorksheet(s);
    ws.columns = IMPORT_COLUMNS[s].map((h) => ({ header: h, width: Math.max(14, h.length + 4) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A cell as the text a person would read: Excel dates become 2026-01-31. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) {
      const r = (v as ExcelJS.CellFormulaValue).result;
      return r instanceof Date ? r.toISOString().slice(0, 10) : String(r ?? "");
    }
    if ("richText" in v)
      return v.richText
        .map((t) => t.text)
        .join("")
        .trim();
    if ("text" in v) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
}

export async function readImportFile(file: ImportFile | null): Promise<RawWorkbook> {
  if (!file || file.bytes.byteLength === 0) {
    throw new ValidationError("Choose the Excel file to import.", { file: "Choose a file." });
  }
  if (file.bytes.byteLength > IMPORT_MAX_BYTES) {
    throw new ValidationError("This file is larger than 2 MB. Split it into smaller files.");
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(file.bytes) as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError(
      "That file isn't an Excel workbook (.xlsx). Download the template, fill it in and upload it.",
    );
  }
  const book: RawWorkbook = {};
  for (const sheet of IMPORT_SHEETS) {
    const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === sheet.toLowerCase());
    if (!ws) continue;
    const header = new Map<number, string>();
    ws.getRow(1).eachCell((cell, col) => {
      header.set(col, cellText(cell).replace(/\*$/, "").trim());
    });
    const rows: RawRow[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const cells: Record<string, string> = {};
      for (const [col, name] of header) cells[name] = cellText(row.getCell(col));
      rows.push({ row: n, cells });
    });
    book[sheet] = rows;
  }
  return book;
}

/** What the account already has (inside its own account scope). */
async function importContext(actor: Actor): Promise<ImportContext> {
  const [buildings, units, unitTypes, tenants] = await Promise.all([
    db.building.findMany({ where: { archivedAt: null }, select: { code: true } }),
    db.unit.findMany({
      where: { archivedAt: null },
      select: {
        unitNumber: true,
        building: { select: { code: true } },
        leases: {
          where: { archivedAt: null },
          select: { startDate: true, endDate: true, terminationDate: true },
        },
      },
    }),
    db.unitType.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { name: true },
    }),
    db.tenant.findMany({ where: { archivedAt: null }, select: { displayName: true } }),
  ]);
  return {
    buildingCodes: buildings.map((b) => b.code),
    units: units.map((u) => ({
      key: importUnitKey(u.building.code, u.unitNumber),
      leases: u.leases.map((l) => ({
        startDate: fromDbDate(l.startDate),
        endDate: fromDbDate(l.endDate),
        terminationDate: l.terminationDate ? fromDbDate(l.terminationDate) : null,
      })),
    })),
    unitTypeNames: unitTypes.map((t) => t.name),
    tenantNames: tenants.map((t) => t.displayName),
    activeUnits: units.length,
    unitLimit: actor.access.units.limit,
    unitLimitMessage: unitLimitMessage(actor.access.plan),
  };
}

/** Step 1: read and check the whole file. Nothing is saved. */
export async function checkImportFile(actor: Actor, file: ImportFile | null): Promise<ImportCheck> {
  assertCanImport(actor);
  const book = await readImportFile(file);
  return checkImport(book, await importContext(actor));
}

export interface ImportSummary {
  buildings: number;
  units: number;
  tenants: number;
  leases: number;
}

export type ImportResult =
  { ok: true; summary: ImportSummary } | { ok: false; errors: ImportError[] };

/**
 * Step 2: check again (the account may have changed since the preview), then save everything.
 * If something still fails part-way (another person adding the same unit at that moment), the
 * records this import created are archived again and nothing is kept.
 */
export async function runImport(
  actor: Actor,
  file: ImportFile | null,
  meta: RequestMeta,
  now = new Date(),
): Promise<ImportResult> {
  const check = await checkImportFile(actor, file);
  if (!check.ok) return { ok: false, errors: check.errors };
  const created = {
    buildings: [] as string[],
    units: [] as string[],
    tenants: [] as string[],
    leases: [] as string[],
  };
  try {
    await save(actor, check.plan, created, meta, now);
  } catch (err) {
    await undo(actor, created, meta);
    const detail = err instanceof ValidationError ? ` (${err.message})` : "";
    return {
      ok: false,
      errors: [
        {
          sheet: null,
          row: null,
          message: `The import stopped part-way${detail}, so nothing was kept. Check the file and try again.`,
        },
      ],
    };
  }
  const summary: ImportSummary = {
    buildings: created.buildings.length,
    units: created.units.length,
    tenants: created.tenants.length,
    leases: created.leases.length,
  };
  await writeAudit({
    actor,
    action: "import.completed",
    entityType: "Account",
    entityId: actor.accountId,
    metadata: { file: file?.name.slice(0, 120) ?? null, ...summary },
    meta,
  });
  return { ok: true, summary };
}

async function save(
  actor: Actor,
  plan: ImportPlan,
  created: { buildings: string[]; units: string[]; tenants: string[]; leases: string[] },
  meta: RequestMeta,
  now: Date,
) {
  const buildingIds = new Map(
    (
      await db.building.findMany({ where: { archivedAt: null }, select: { id: true, code: true } })
    ).map((b) => [b.code, b.id]),
  );
  for (const b of plan.buildings) {
    const row = await createBuilding(actor, { ...b, notes: "" }, meta);
    created.buildings.push(row.id);
    buildingIds.set(b.code, row.id);
  }

  const unitTypeIds = new Map(
    (
      await db.unitType.findMany({ where: { archivedAt: null }, select: { id: true, name: true } })
    ).map((t) => [t.name, t.id]),
  );
  const unitIds = new Map(
    (
      await db.unit.findMany({
        where: { archivedAt: null },
        select: { id: true, unitNumber: true, building: { select: { code: true } } },
      })
    ).map((u) => [importUnitKey(u.building.code, u.unitNumber), u.id]),
  );
  for (const u of plan.units) {
    const row = await createUnit(
      actor,
      {
        buildingId: buildingIds.get(u.buildingCode),
        unitTypeId: unitTypeIds.get(u.unitTypeName),
        unitNumber: u.unitNumber,
        floor: u.floor ?? "",
        floorArea: u.floorArea ?? "",
      },
      meta,
    );
    created.units.push(row.id);
    unitIds.set(importUnitKey(u.buildingCode, u.unitNumber), row.id);
  }

  const tenantIds = new Map<string, string>();
  for (const t of await db.tenant.findMany({
    where: { archivedAt: null },
    select: { id: true, displayName: true },
  })) {
    tenantIds.set(importTenantKey(t.displayName), t.id);
  }
  for (const t of plan.tenants) {
    const row = await createTenant(actor, t, meta, now);
    created.tenants.push(row.id);
    tenantIds.set(importTenantKey(t.displayName), row.id);
  }

  for (const l of plan.leases) {
    const row = await createLease(
      actor,
      {
        unitId: unitIds.get(importUnitKey(l.buildingCode, l.unitNumber)),
        tenantId: tenantIds.get(l.tenantKey),
        ...l.terms,
      },
      meta,
      now,
    );
    created.leases.push(row.id);
  }
}

/** Archive what a failed import created, newest first. Best effort: each failure is logged. */
async function undo(
  actor: Actor,
  created: { buildings: string[]; units: string[]; tenants: string[]; leases: string[] },
  meta: RequestMeta,
) {
  const steps: (() => Promise<unknown>)[] = [
    ...created.leases.map((id) => () => setLeaseArchived(actor, id, true, meta)),
    ...created.tenants.map((id) => () => setTenantArchived(actor, id, true, meta)),
    ...created.units.map((id) => () => setUnitArchived(actor, id, true, meta)),
    ...created.buildings.map((id) => () => setBuildingArchived(actor, id, true, meta)),
  ];
  for (const step of steps) {
    await step().catch((err: unknown) =>
      console.error("[import] undo step failed:", (err as Error).name),
    );
  }
}
