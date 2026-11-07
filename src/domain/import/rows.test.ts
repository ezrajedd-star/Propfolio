import { describe, expect, it } from "vitest";

import { checkImport, importUnitKey, type ImportContext, type RawWorkbook } from "./rows";

const ctx = (o: Partial<ImportContext> = {}): ImportContext => ({
  buildingCodes: ["OLD"],
  units: [
    {
      key: importUnitKey("OLD", "101"),
      leases: [{ startDate: "2026-01-01", endDate: "2026-12-31", terminationDate: null }],
    },
  ],
  unitTypeNames: ["Office", "Residential"],
  tenantNames: ["Existing Co", "Twin Corp", "Twin Corp"],
  activeUnits: 1,
  unitLimit: 3,
  unitLimitMessage: "The Free plan includes up to 3 units. Upgrade to add more.",
  ...o,
});

const r = (row: number, cells: Record<string, string>) => ({ row, cells });
const building = (o: Record<string, string> = {}) =>
  r(2, {
    "Building code": "twr1",
    "Building name": "Tower One",
    Address: "1 Ayala Ave",
    Type: "Commercial",
    ...o,
  });
const unit = (row: number, o: Record<string, string> = {}) =>
  r(row, { "Building code": "TWR1", "Unit number": "201", "Unit type": "office", ...o });
const tenant = (row: number, o: Record<string, string> = {}) =>
  r(row, {
    "Tenant name": "ABC Corporation",
    "Company or individual": "Company",
    Email: "ap@abc.example",
    "Privacy notice given": "Signed form",
    ...o,
  });
const lease = (row: number, o: Record<string, string> = {}) =>
  r(row, {
    "Building code": "TWR1",
    "Unit number": "201",
    "Tenant name": "abc corporation",
    "First day": "2026-01-01",
    "Last day": "2027-12-31",
    "Monthly rent": "50,000",
    "Rent due day": "5",
    "Security deposit": "100000",
    "Advance rent (months)": "2",
    "Yearly increase (%)": "5",
    ...o,
  });

const good: RawWorkbook = {
  Buildings: [building()],
  Units: [unit(2), unit(3, { "Unit number": "202" })],
  Tenants: [tenant(2)],
  Leases: [lease(2)],
};

describe("checkImport", () => {
  it("a good file becomes a plan, with the form's rules applied", () => {
    const res = checkImport(good, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.buildings).toEqual([
      { code: "TWR1", name: "Tower One", address: "1 Ayala Ave", type: "COMMERCIAL" },
    ]);
    expect(res.plan.units.map((u) => [u.unitNumber, u.unitTypeName])).toEqual([
      ["201", "Office"],
      ["202", "Office"],
    ]);
    expect(res.plan.tenants[0]).toMatchObject({
      displayName: "ABC Corporation",
      privacyAckMethod: "SIGNED_FORM",
    });
    expect(res.plan.leases[0]!.terms).toMatchObject({
      monthlyRent: "50000.00",
      advanceRentType: "MONTHS",
      advanceRentMonths: 2,
      escalationType: "PERCENT",
      escalationPercent: "5.000",
      escalationEveryMonths: 12,
    });
  });

  it("leases can refer to units and tenants already in Propfolio", () => {
    const res = checkImport(
      {
        Leases: [
          lease(2, {
            "Building code": "old",
            "Unit number": "101",
            "Tenant name": "Existing Co",
            "First day": "2027-01-01",
            "Last day": "2027-12-31",
          }),
        ],
      },
      ctx(),
    );
    expect(res.ok).toBe(true);
  });

  const errorsOf = (book: RawWorkbook, c = ctx()) => {
    const res = checkImport(book, c);
    return res.ok ? [] : res.errors.map((e) => `${e.sheet ?? "-"}:${e.row ?? "-"} ${e.message}`);
  };

  it.each<[string, RawWorkbook, string]>([
    ["an empty file", {}, "-:- The file has no rows to import."],
    [
      "a bad building type",
      { Buildings: [building({ Type: "Castle" })] },
      "Buildings:2 Type: use one of",
    ],
    [
      "a building code already in Propfolio",
      { Buildings: [building({ "Building code": "old" })] },
      "Buildings:2 Building code: OLD already exists",
    ],
    [
      "a unit of an unknown building",
      { Units: [unit(2, { "Building code": "NOPE" })] },
      "Units:2 Building code: there's no building NOPE",
    ],
    [
      "an unknown unit type",
      { Buildings: [building()], Units: [unit(2, { "Unit type": "Spaceship" })] },
      "Units:2 Unit type: use one of Office, Residential",
    ],
    [
      "a unit twice",
      { Buildings: [building()], Units: [unit(2), unit(3)] },
      "Units:3 Unit number: unit 201 of TWR1 appears twice",
    ],
    [
      "a unit already in Propfolio",
      { Units: [unit(2, { "Building code": "OLD", "Unit number": "101" })] },
      "Units:2 Unit number: OLD already has unit 101",
    ],
    [
      "no privacy notice",
      { Tenants: [tenant(2, { "Privacy notice given": "" })] },
      "Tenants:2 Privacy notice given: write Signed form, Email or In person.",
    ],
    [
      "a bad email",
      { Tenants: [tenant(2, { Email: "not-an-email" })] },
      "Tenants:2 Email: Enter a valid email address",
    ],
    [
      "a tenant already in Propfolio",
      { Tenants: [tenant(2, { "Tenant name": "existing co" })] },
      "Tenants:2 Tenant name: existing co is already in Propfolio",
    ],
    [
      "a lease for an unknown tenant",
      { ...good, Leases: [lease(2, { "Tenant name": "Nobody" })] },
      "Leases:2 Tenant name: there's no tenant called Nobody",
    ],
    [
      "an ambiguous existing tenant",
      { ...good, Leases: [lease(2, { "Tenant name": "Twin Corp" })] },
      "Leases:2 Tenant name: Propfolio has more than one tenant called Twin Corp",
    ],
    [
      "an end before the start",
      { ...good, Leases: [lease(2, { "Last day": "2025-12-31" })] },
      "Leases:2 Last day: The end date must be after the start date.",
    ],
    [
      "no monthly rent",
      { ...good, Leases: [lease(2, { "Monthly rent": "" })] },
      "Leases:2 Monthly rent:",
    ],
    [
      "a due day of 31",
      { ...good, Leases: [lease(2, { "Rent due day": "31" })] },
      "Leases:2 Rent due day: Use a day from 1 to 28",
    ],
    [
      "overlapping leases in the file",
      {
        ...good,
        Leases: [lease(2), lease(3, { "First day": "2027-06-01", "Last day": "2028-05-31" })],
      },
      "Leases:3 Dates: overlap with the lease for unit 201 of TWR1 on row 2.",
    ],
    [
      "a lease overlapping one in Propfolio",
      {
        Leases: [
          lease(2, { "Building code": "OLD", "Unit number": "101", "Tenant name": "Existing Co" }),
        ],
      },
      "Leases:2 Dates: unit 101 of OLD already has a lease from 2026-01-01 to 2026-12-31.",
    ],
    [
      "more units than the plan allows",
      {
        Buildings: [building()],
        Units: [unit(2), unit(3, { "Unit number": "202" }), unit(4, { "Unit number": "203" })],
      },
      "Units:- This file adds 3 units to the 1 you have. The Free plan includes up to 3 units.",
    ],
  ])("%s", (_name, book, expected) => {
    expect(errorsOf(book).some((e) => e.startsWith(expected))).toBe(true);
  });

  it("reports every problem at once, in sheet and row order", () => {
    const errs = errorsOf({
      Leases: [lease(5, { "Tenant name": "Nobody" })],
      Buildings: [building({ Address: "" })],
    });
    expect(errs[0]).toMatch(/^Buildings:2 Address:/);
    expect(errs.at(-1)).toMatch(/^Leases:5/);
  });

  it("blank rows are ignored", () => {
    expect(
      checkImport(
        { ...good, Units: [...good.Units!, r(9, { "Building code": "", "Unit number": " " })] },
        ctx(),
      ).ok,
    ).toBe(true);
  });
});
