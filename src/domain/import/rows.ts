/**
 * Excel import: check every row of the four sheets (Buildings, Units, Tenants, Leases) against
 * the same rules as the forms, plus what only makes sense across rows (duplicates, references
 * between sheets, overlapping leases, the plan's unit limit). Pure: the server reads the file and
 * the account's existing records, and saves only when this finds no errors at all.
 */
import { z } from "zod";

import { findOverlap, type Period } from "@/domain/leases/status";
import type { IsoDate } from "@/domain/time/calendar-date";
import {
  BUILDING_TYPES,
  BUILDING_TYPE_LABELS,
  buildingSchema,
  unitSchema,
} from "@/schemas/property";
import { leaseTermsSchema, type LeaseTerms } from "@/schemas/lease";
import { PRIVACY_ACK_METHODS, TENANT_TYPES, createTenantSchema } from "@/schemas/tenant";

export const IMPORT_SHEETS = ["Buildings", "Units", "Tenants", "Leases"] as const;
export type ImportSheet = (typeof IMPORT_SHEETS)[number];
export const IMPORT_MAX_ROWS = 1000;

/** The columns of each sheet, in template order. `*` = required. */
export const IMPORT_COLUMNS: Record<ImportSheet, string[]> = {
  Buildings: ["Building code*", "Building name*", "Address*", "Type*"],
  Units: ["Building code*", "Unit number*", "Unit type*", "Floor", "Floor area (sqm)"],
  Tenants: [
    "Tenant name*",
    "Company or individual*",
    "Contact person",
    "Phone",
    "Email",
    "Billing address",
    "TIN",
    "Privacy notice given*",
  ],
  Leases: [
    "Building code*",
    "Unit number*",
    "Tenant name*",
    "First day*",
    "Last day*",
    "Monthly rent*",
    "Rent due day*",
    "Security deposit*",
    "Advance rent (months)",
    "Yearly increase (%)",
    "Increase every (months)",
  ],
};

/** A sheet row as text, by column name (without the `*`), plus its row number in Excel. */
export interface RawRow {
  row: number;
  cells: Record<string, string>;
}
export type RawWorkbook = Partial<Record<ImportSheet, RawRow[]>>;

/** What the account already has, for references and duplicates. */
export interface ImportContext {
  buildingCodes: string[];
  /** Active units, keyed `CODE|unit number` (code upper-case, number as typed). */
  units: { key: string; leases: (Period & { terminationDate: IsoDate | null })[] }[];
  unitTypeNames: string[];
  /** Active tenants' names (several can share a name). */
  tenantNames: string[];
  activeUnits: number;
  unitLimit: number;
  unitLimitMessage: string;
}

export interface ImportError {
  sheet: ImportSheet | null;
  row: number | null;
  message: string;
}

export interface PlannedBuilding {
  code: string;
  name: string;
  address: string;
  type: (typeof BUILDING_TYPES)[number];
}
export interface PlannedUnit {
  buildingCode: string;
  unitNumber: string;
  unitTypeName: string;
  floor: string | null;
  floorArea: string | null;
}
export type PlannedTenant = z.output<typeof createTenantSchema>;
export interface PlannedLease {
  buildingCode: string;
  unitNumber: string;
  /** Lower-cased tenant name. */
  tenantKey: string;
  terms: LeaseTerms;
}
export interface ImportPlan {
  buildings: PlannedBuilding[];
  units: PlannedUnit[];
  tenants: PlannedTenant[];
  leases: PlannedLease[];
}

export type ImportCheck =
  | { ok: true; plan: ImportPlan }
  | { ok: false; errors: ImportError[]; counts: Record<ImportSheet, number> };

const PLACEHOLDER_ID = "00000000-0000-7000-8000-000000000000";
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const unitKey = (code: string, number: string) => `${code.trim().toUpperCase()}|${norm(number)}`;

const BUILDING_TYPE_BY_LABEL: Record<string, (typeof BUILDING_TYPES)[number]> = Object.fromEntries(
  BUILDING_TYPES.flatMap((t) => [
    [norm(BUILDING_TYPE_LABELS[t]), t],
    [norm(t.replace(/_/g, " ")), t],
  ]),
);
const TENANT_TYPE_BY_LABEL: Record<string, (typeof TENANT_TYPES)[number]> = {
  company: "COMPANY",
  individual: "INDIVIDUAL",
  person: "INDIVIDUAL",
};
const PRIVACY_BY_LABEL: Record<string, (typeof PRIVACY_ACK_METHODS)[number]> = {
  "signed form": "SIGNED_FORM",
  signed: "SIGNED_FORM",
  email: "EMAIL",
  "in person": "IN_PERSON",
};

/** "Unit number: Enter the unit number or name." from a schema's first problem per field. */
function issues(error: z.ZodError, labels: Record<string, string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of error.issues) {
    const field = String(i.path[0] ?? "");
    if (seen.has(field)) continue;
    seen.add(field);
    out.push(labels[field] ? `${labels[field]}: ${i.message}` : i.message);
  }
  return out;
}

const blank = (v: string | undefined) => !v || v.trim() === "";

export function checkImport(book: RawWorkbook, ctx: ImportContext): ImportCheck {
  const errors: ImportError[] = [];
  const err = (sheet: ImportSheet, row: number, message: string) =>
    errors.push({ sheet, row, message });
  const rows = (s: ImportSheet) =>
    (book[s] ?? []).filter((r) => Object.values(r.cells).some((v) => !blank(v)));
  const counts = Object.fromEntries(IMPORT_SHEETS.map((s) => [s, rows(s).length])) as Record<
    ImportSheet,
    number
  >;

  for (const s of IMPORT_SHEETS) {
    if (counts[s] > IMPORT_MAX_ROWS) {
      errors.push({
        sheet: s,
        row: null,
        message: `This sheet has ${counts[s]} rows. Import at most ${IMPORT_MAX_ROWS} at a time.`,
      });
    }
  }
  if (IMPORT_SHEETS.every((s) => counts[s] === 0)) {
    return {
      ok: false,
      counts,
      errors: [
        {
          sheet: null,
          row: null,
          message: "The file has no rows to import. Fill in the template's sheets first.",
        },
      ],
    };
  }

  // ─── Buildings ───
  const plan: ImportPlan = { buildings: [], units: [], tenants: [], leases: [] };
  const existingCodes = new Set(ctx.buildingCodes.map((c) => c.toUpperCase()));
  const fileCodes = new Set<string>();
  for (const { row, cells } of rows("Buildings")) {
    const type = BUILDING_TYPE_BY_LABEL[norm(cells["Type"] ?? "")];
    const parsed = buildingSchema.safeParse({
      code: cells["Building code"] ?? "",
      name: cells["Building name"] ?? "",
      address: cells["Address"] ?? "",
      type: type ?? "",
      notes: "",
    });
    if (!type) {
      err(
        "Buildings",
        row,
        `Type: use one of ${BUILDING_TYPES.map((t) => BUILDING_TYPE_LABELS[t]).join(", ")}.`,
      );
    }
    if (!parsed.success) {
      for (const m of issues(parsed.error, {
        code: "Building code",
        name: "Building name",
        address: "Address",
      })) {
        if (!m.startsWith("Choose the building type")) err("Buildings", row, m);
      }
      continue;
    }
    const code = parsed.data.code;
    if (existingCodes.has(code)) {
      err(
        "Buildings",
        row,
        `Building code: ${code} already exists in Propfolio. Leave it out of this sheet; units can still refer to it.`,
      );
    } else if (fileCodes.has(code)) {
      err("Buildings", row, `Building code: ${code} appears twice in this sheet.`);
    } else if (type) {
      fileCodes.add(code);
      plan.buildings.push({ code, name: parsed.data.name, address: parsed.data.address, type });
    }
  }
  const knownCode = (code: string) => existingCodes.has(code) || fileCodes.has(code);

  // ─── Units ───
  const unitTypes = new Map(ctx.unitTypeNames.map((n) => [norm(n), n]));
  // Keyed with importUnitKey (the server builds ctx.units with it).
  const existingUnits = new Map(ctx.units.map((u) => [u.key, u]));
  const fileUnits = new Set<string>();
  for (const { row, cells } of rows("Units")) {
    const code = (cells["Building code"] ?? "").trim().toUpperCase();
    const typeName = unitTypes.get(norm(cells["Unit type"] ?? ""));
    const parsed = unitSchema.safeParse({
      buildingId: PLACEHOLDER_ID,
      unitTypeId: PLACEHOLDER_ID,
      unitNumber: cells["Unit number"] ?? "",
      floor: cells["Floor"] ?? "",
      floorArea: cells["Floor area (sqm)"] ?? "",
    });
    let ok = true;
    if (!code) {
      err("Units", row, "Building code: enter the code of the unit's building.");
      ok = false;
    } else if (!knownCode(code)) {
      err(
        "Units",
        row,
        `Building code: there's no building ${code}, in Propfolio or in the Buildings sheet.`,
      );
      ok = false;
    }
    if (!typeName) {
      err(
        "Units",
        row,
        `Unit type: use one of ${ctx.unitTypeNames.join(", ")} (Settings → Unit types).`,
      );
      ok = false;
    }
    if (!parsed.success) {
      for (const m of issues(parsed.error, {
        unitNumber: "Unit number",
        floor: "Floor",
        floorArea: "Floor area",
      })) {
        err("Units", row, m);
      }
      continue;
    }
    if (!ok) continue;
    const key = unitKey(code, parsed.data.unitNumber);
    if (existingUnits.has(key)) {
      err("Units", row, `Unit number: ${code} already has unit ${parsed.data.unitNumber}.`);
    } else if (fileUnits.has(key)) {
      err(
        "Units",
        row,
        `Unit number: unit ${parsed.data.unitNumber} of ${code} appears twice in this sheet.`,
      );
    } else {
      fileUnits.add(key);
      plan.units.push({
        buildingCode: code,
        unitNumber: parsed.data.unitNumber,
        unitTypeName: typeName!,
        floor: parsed.data.floor,
        floorArea: parsed.data.floorArea,
      });
    }
  }
  if (ctx.activeUnits + plan.units.length > ctx.unitLimit) {
    errors.push({
      sheet: "Units",
      row: null,
      message: `This file adds ${plan.units.length} units to the ${ctx.activeUnits} you have. ${ctx.unitLimitMessage}`,
    });
  }

  // ─── Tenants ───
  const existingTenants = new Map<string, number>();
  for (const n of ctx.tenantNames)
    existingTenants.set(norm(n), (existingTenants.get(norm(n)) ?? 0) + 1);
  const fileTenants = new Set<string>();
  for (const { row, cells } of rows("Tenants")) {
    const type = TENANT_TYPE_BY_LABEL[norm(cells["Company or individual"] ?? "")];
    const method = PRIVACY_BY_LABEL[norm(cells["Privacy notice given"] ?? "")];
    if (!type) err("Tenants", row, "Company or individual: write Company or Individual.");
    if (!method) {
      err(
        "Tenants",
        row,
        "Privacy notice given: write Signed form, Email or In person. Every tenant must have received the privacy notice.",
      );
    }
    const parsed = createTenantSchema.safeParse({
      type: type ?? "COMPANY",
      displayName: cells["Tenant name"] ?? "",
      registeredName: "",
      tin: cells["TIN"] ?? "",
      contactPerson: cells["Contact person"] ?? "",
      phone: cells["Phone"] ?? "",
      email: cells["Email"] ?? "",
      billingAddress: cells["Billing address"] ?? "",
      notes: "",
      privacyAcknowledged: true,
      privacyAckMethod: method ?? "SIGNED_FORM",
    });
    if (!parsed.success) {
      for (const m of issues(parsed.error, {
        displayName: "Tenant name",
        tin: "TIN",
        contactPerson: "Contact person",
        phone: "Phone",
        email: "Email",
        billingAddress: "Billing address",
      })) {
        err("Tenants", row, m);
      }
      continue;
    }
    if (!type || !method) continue;
    const key = norm(parsed.data.displayName);
    if (existingTenants.has(key)) {
      err(
        "Tenants",
        row,
        `Tenant name: ${parsed.data.displayName} is already in Propfolio. Leave them out of this sheet; leases can still refer to them.`,
      );
    } else if (fileTenants.has(key)) {
      err("Tenants", row, `Tenant name: ${parsed.data.displayName} appears twice in this sheet.`);
    } else {
      fileTenants.add(key);
      plan.tenants.push(parsed.data);
    }
  }

  // ─── Leases ───
  const fileLeasePeriods = new Map<string, (Period & { terminationDate: null; row: number })[]>();
  for (const { row, cells } of rows("Leases")) {
    const code = (cells["Building code"] ?? "").trim().toUpperCase();
    const number = (cells["Unit number"] ?? "").trim();
    const tenantKey = norm(cells["Tenant name"] ?? "");
    const key = unitKey(code, number);
    let ok = true;
    if (!code || !number) {
      err("Leases", row, "Building code and Unit number: enter both, so we know which unit it is.");
      ok = false;
    } else if (!existingUnits.has(key) && !fileUnits.has(key)) {
      err(
        "Leases",
        row,
        `Unit: there's no unit ${number} in ${code}, in Propfolio or in the Units sheet.`,
      );
      ok = false;
    }
    if (!tenantKey) {
      err(
        "Leases",
        row,
        "Tenant name: enter the tenant, exactly as in the Tenants sheet or Propfolio.",
      );
      ok = false;
    } else if (!fileTenants.has(tenantKey) && !existingTenants.has(tenantKey)) {
      err(
        "Leases",
        row,
        `Tenant name: there's no tenant called ${cells["Tenant name"]!.trim()}, in Propfolio or in the Tenants sheet.`,
      );
      ok = false;
    } else if (!fileTenants.has(tenantKey) && (existingTenants.get(tenantKey) ?? 0) > 1) {
      err(
        "Leases",
        row,
        `Tenant name: Propfolio has more than one tenant called ${cells["Tenant name"]!.trim()}. Add this lease by hand.`,
      );
      ok = false;
    }
    const percent = (cells["Yearly increase (%)"] ?? "").replace("%", "").trim();
    const months = (cells["Advance rent (months)"] ?? "").trim();
    const parsed = leaseTermsSchema.safeParse({
      startDate: cells["First day"] ?? "",
      endDate: cells["Last day"] ?? "",
      monthlyRent: cells["Monthly rent"] ?? "",
      rentDueDay: cells["Rent due day"] ?? "",
      securityDeposit: cells["Security deposit"] ?? "",
      advanceRentType: months && months !== "0" ? "MONTHS" : "NONE",
      advanceRentMonths: months && months !== "0" ? months : null,
      escalationType: percent && percent !== "0" ? "PERCENT" : "NONE",
      escalationPercent: percent || null,
      escalationEveryMonths: percent
        ? (cells["Increase every (months)"] ?? "").trim() || "12"
        : null,
      remarks: "",
    });
    if (!parsed.success) {
      for (const m of issues(parsed.error, {
        startDate: "First day",
        endDate: "Last day",
        monthlyRent: "Monthly rent",
        rentDueDay: "Rent due day",
        securityDeposit: "Security deposit",
        advanceRentMonths: "Advance rent (months)",
        escalationPercent: "Yearly increase (%)",
        escalationEveryMonths: "Increase every (months)",
      })) {
        err("Leases", row, m);
      }
      continue;
    }
    if (!ok) continue;
    const period = { startDate: parsed.data.startDate, endDate: parsed.data.endDate };
    const inDb = findOverlap(period, existingUnits.get(key)?.leases ?? []);
    const inFile = findOverlap(period, fileLeasePeriods.get(key) ?? []);
    if (inDb) {
      err(
        "Leases",
        row,
        `Dates: unit ${number} of ${code} already has a lease from ${inDb.startDate} to ${inDb.terminationDate ?? inDb.endDate}.`,
      );
      continue;
    }
    if (inFile) {
      err(
        "Leases",
        row,
        `Dates: overlap with the lease for unit ${number} of ${code} on row ${inFile.row}.`,
      );
      continue;
    }
    fileLeasePeriods.set(key, [
      ...(fileLeasePeriods.get(key) ?? []),
      { ...period, terminationDate: null, row },
    ]);
    plan.leases.push({ buildingCode: code, unitNumber: number, tenantKey, terms: parsed.data });
  }

  errors.sort(
    (a, b) =>
      IMPORT_SHEETS.indexOf(a.sheet ?? "Buildings") -
        IMPORT_SHEETS.indexOf(b.sheet ?? "Buildings") || (a.row ?? 0) - (b.row ?? 0),
  );
  return errors.length ? { ok: false, errors, counts } : { ok: true, plan };
}

/** `CODE|unit number`, as ImportContext.units are keyed. */
export function importUnitKey(code: string, unitNumber: string): string {
  return unitKey(code, unitNumber);
}

/** Lower-cased tenant name, as PlannedLease.tenantKey. */
export function importTenantKey(name: string): string {
  return norm(name);
}
