import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { overdueReport } from "@/server/billing/balances";
import { addOtherCharge, previewChargeChanges, voidCharge } from "@/server/billing/charges";
import { exportOverdue } from "@/server/billing/export";
import {
  applyCredit,
  getLeaseLedger,
  getPaymentAcknowledgement,
  listPayments,
  openChargesForPayment,
  recordPayment,
  voidPayment,
} from "@/server/billing/payments";
import { getDashboard } from "@/server/dashboard";
import {
  createLease,
  listLeases,
  renewLease,
  terminateLease,
  updateLease,
} from "@/server/leases/service";
import type { Actor } from "@/server/auth/authorize";
import { makeProperty, makeTenant, makeUser, meta, resetDb, terms } from "./helpers";

beforeEach(resetDb);
const NOW = new Date("2026-04-10T02:00:00Z"); // 10 Apr 2026, Manila

async function setup(o: Record<string, unknown> = {}) {
  const admin = await makeUser("ADMIN");
  const staff = await makeUser("LEASING_STAFF");
  const viewer = await makeUser("VIEWER");
  const { units } = await makeProperty(admin, { units: ["101", "102"] });
  const tenant = await makeTenant(staff);
  const lease = await createLease(
    staff,
    {
      unitId: units[0]!.id,
      tenantId: tenant.id,
      ...terms({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyRent: "50000",
        rentDueDay: 5,
        securityDeposit: "100000",
        advanceRentType: "NONE",
        escalationType: "NONE",
        ...o,
      }),
    },
    meta,
    NOW,
  );
  return { admin, staff, viewer, units, tenant, lease };
}

const pay = (staff: Actor, leaseId: string, amount: string, extra: Record<string, unknown> = {}) =>
  recordPayment(
    staff,
    {
      leaseId,
      receivedDate: "2026-04-09",
      amount,
      method: "BANK_TRANSFER",
      reference: "BT-1",
      ...extra,
    },
    meta,
    NOW,
  );

describe("charges", () => {
  it("are generated for the whole lease when it is created", async () => {
    const { staff, lease } = await setup();
    const ledger = await getLeaseLedger(staff, lease.id, NOW);
    expect(ledger.charges.map((c) => c.type)).toEqual(["DEPOSIT", ...Array(12).fill("RENT")]);
    // Deposit (1 Jan) and rent for Jan–Apr (due 5th) are due → 4 × 50,000 + 100,000.
    expect(ledger.totals).toMatchObject({
      charged: "700000.00",
      balanceDue: "300000.00",
      overdue: "300000.00",
      overdueCount: 5,
      paid: "0.00",
    });
  });

  it("include rent increases from the escalation", async () => {
    const { staff, lease } = await setup({
      endDate: "2027-12-31",
      escalationType: "PERCENT",
      escalationPercent: "10",
      escalationEveryMonths: 12,
    });
    const rent = (await getLeaseLedger(staff, lease.id, NOW)).charges.filter(
      (c) => c.type === "RENT",
    );
    expect(rent[11]?.amount).toBe("50000.00");
    expect(rent[12]?.amount).toBe("55000.00");
  });
});

describe("payments", () => {
  it("go to the oldest unpaid charges first, with partial payments", async () => {
    const { staff, lease } = await setup();
    await pay(staff, lease.id, "125000.50");
    const ledger = await getLeaseLedger(staff, lease.id, NOW);
    const [deposit, jan] = ledger.charges;
    expect(deposit).toMatchObject({ state: "Paid", outstanding: "0.00" });
    expect(jan).toMatchObject({
      state: "Overdue (part paid)",
      paid: "25000.50",
      outstanding: "24999.50",
    });
    expect(ledger.totals.overdue).toBe("174999.50");
  });

  it("over-payments become credit that can be applied later", async () => {
    const { staff, lease } = await setup();
    await pay(staff, lease.id, "320000");
    let ledger = await getLeaseLedger(staff, lease.id, NOW);
    // 300,000 due now + May rent (future) is also open → all of it goes to charges.
    expect(ledger.totals.credit).toBe("0.00");
    expect(ledger.charges.find((c) => c.dueDate === "2026-05-05")?.paid).toBe("20000.00");

    await pay(staff, lease.id, "1000000");
    ledger = await getLeaseLedger(staff, lease.id, NOW);
    expect(ledger.totals.credit).toBe("620000.00"); // only 380,000 left to charge for the year
    expect(ledger.totals.totalOutstanding).toBe("0.00");

    // Extending the lease adds charges; the credit pays them.
    await updateLease(
      staff,
      lease.id,
      {
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        ...terms({
          startDate: "2026-01-01",
          endDate: "2027-03-31",
          monthlyRent: "50000",
          rentDueDay: 5,
          securityDeposit: "100000",
          advanceRentType: "NONE",
          escalationType: "NONE",
        }),
      },
      meta,
      NOW,
    );
    expect((await applyCredit(staff, lease.id, meta)).applied).toBe("150000.00");
    expect((await getLeaseLedger(staff, lease.id, NOW)).totals.credit).toBe("470000.00");
  });

  it("can be split by hand, within limits", async () => {
    const { staff, lease } = await setup();
    const open = await openChargesForPayment(staff, lease.id, NOW);
    const april = open.find((c) => c.dueDate === "2026-04-05")!;
    await pay(staff, lease.id, "50000", { allocations: [{ chargeId: april.id, amount: "50000" }] });
    const ledger = await getLeaseLedger(staff, lease.id, NOW);
    expect(ledger.charges.find((c) => c.id === april.id)?.state).toBe("Paid");
    expect(ledger.charges[0]?.state).toBe("Overdue");

    await expect(
      pay(staff, lease.id, "100", { allocations: [{ chargeId: april.id, amount: "100" }] }),
    ).rejects.toBeInstanceOf(ValidationError);
    const jan = open.find((c) => c.dueDate === "2026-01-05")!;
    await expect(
      pay(staff, lease.id, "100", { allocations: [{ chargeId: jan.id, amount: "200" }] }),
    ).rejects.toThrow(/add up to more/);
  });

  it("are voided with a reason, never deleted; the balance comes back", async () => {
    const { staff, lease } = await setup();
    const p = await pay(staff, lease.id, "150000");
    expect(p.paymentNo).toBe("PAY-2026-0001");
    await expect(voidPayment(staff, p.id, { reason: "" }, meta)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await voidPayment(staff, p.id, { reason: "Cheque bounced" }, meta);
    const ledger = await getLeaseLedger(staff, lease.id, NOW);
    expect(ledger.payments[0]).toMatchObject({ status: "VOID", voidReason: "Cheque bounced" });
    expect(ledger.totals.overdue).toBe("300000.00");
    expect(await db.payment.count()).toBe(1);
    const log = await db.auditLog.findMany({
      where: { action: { in: ["payment.record", "payment.void"] } },
    });
    expect(log.map((l) => l.action).sort()).toEqual(["payment.record", "payment.void"]);
  });

  it("rejects future dates and produce an acknowledgement", async () => {
    const { staff, lease } = await setup();
    await expect(pay(staff, lease.id, "1", { receivedDate: "2026-04-11" })).rejects.toThrow();
    const p = await pay(staff, lease.id, "100000");
    const ack = await getPaymentAcknowledgement(staff, p.id);
    expect(ack).toMatchObject({
      paymentNo: "PAY-2026-0001",
      amountLabel: "₱100,000.00",
      method: "Bank transfer",
      lines: [{ description: "Security deposit", amount: "100000.00" }],
    });
    expect((await listPayments(staff, { from: "2026-04-01", to: "2026-04-30" })).length).toBe(1);
  });
});

describe("terms changes and early endings", () => {
  it("previews and then regenerates only future unpaid charges", async () => {
    const { staff, lease } = await setup();
    await pay(staff, lease.id, "300000"); // pays deposit + Jan–Apr
    const input = {
      unitId: lease.unitId,
      tenantId: lease.tenantId,
      ...terms({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        monthlyRent: "55000",
        rentDueDay: 5,
        securityDeposit: "100000",
        advanceRentType: "NONE",
        escalationType: "NONE",
      }),
    };
    const preview = await previewChargeChanges(staff, lease.id, input, NOW);
    expect(preview.removed).toHaveLength(8); // May–Dec
    expect(preview.added.every((a) => a.amount === "55000.00")).toBe(true);
    expect(preview.keptAsIs.map((k) => k.why)).toEqual(
      Array(4).fill("already paid (fully or partly)"),
    );

    await updateLease(staff, lease.id, input, meta, NOW);
    const ledger = await getLeaseLedger(staff, lease.id, NOW);
    const active = ledger.charges.filter((c) => c.status === "ACTIVE" && c.type === "RENT");
    expect(active.map((c) => c.amount)).toEqual([
      ...Array(4).fill("50000.00"),
      ...Array(8).fill("55000.00"),
    ]);
    expect(ledger.charges.filter((c) => c.status === "CANCELLED")).toHaveLength(8);
  });

  it("ending early cancels unpaid rent after the last day", async () => {
    const { staff, lease } = await setup();
    await terminateLease(
      staff,
      lease.id,
      { terminationDate: "2026-06-30", reason: "Closing branch" },
      meta,
      NOW,
    );
    const ledger = await getLeaseLedger(staff, lease.id, NOW);
    const cancelled = ledger.charges.filter((c) => c.status === "CANCELLED");
    expect(cancelled.map((c) => c.dueDate)).toEqual([
      "2026-07-05",
      "2026-08-05",
      "2026-09-05",
      "2026-10-05",
      "2026-11-05",
      "2026-12-05",
    ]);
    expect(cancelled[0]?.statusReason).toBe("Lease ended early on 30 Jun 2026");
  });

  it("a renewal gets its own charges", async () => {
    const { staff, lease } = await setup();
    const r = await renewLease(
      staff,
      lease.id,
      terms({
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        monthlyRent: "52000",
        rentDueDay: 5,
        securityDeposit: "0",
        advanceRentType: "NONE",
        escalationType: "NONE",
      }),
      meta,
      NOW,
    );
    expect((await getLeaseLedger(staff, r.id, NOW)).charges.map((c) => c.amount)).toEqual(
      Array(12).fill("52000.00"),
    );
  });

  it("other charges can be added and voided (only when unpaid)", async () => {
    const { staff, lease } = await setup();
    const c = await addOtherCharge(
      staff,
      lease.id,
      { description: "Parking, March", amount: "1500", dueDate: "2026-03-01" },
      meta,
    );
    await pay(staff, lease.id, "101500", { allocations: [{ chargeId: c.id, amount: "1500" }] });
    await expect(voidCharge(staff, c.id, { reason: "Added by mistake" }, meta)).rejects.toThrow(
      /Void that payment first/,
    );
    const c2 = await addOtherCharge(
      staff,
      lease.id,
      { description: "Key replacement", amount: "500", dueDate: "2026-04-01" },
      meta,
    );
    await voidCharge(staff, c2.id, { reason: "Waived by management" }, meta);
    expect(
      (await getLeaseLedger(staff, lease.id, NOW)).charges.find((x) => x.id === c2.id),
    ).toMatchObject({ status: "VOID", state: "Voided" });
  });
});

describe("overdue totals", () => {
  it("match between the dashboard, the lease page, the grid and the overdue list", async () => {
    const { staff, units, tenant, lease } = await setup();
    const other = await createLease(
      staff,
      {
        unitId: units[1]!.id,
        tenantId: tenant.id,
        ...terms({
          startDate: "2025-10-15",
          endDate: "2026-10-14",
          monthlyRent: "33333.33",
          rentDueDay: 20,
          securityDeposit: "0",
          advanceRentType: "NONE",
          escalationType: "NONE",
        }),
      },
      meta,
      NOW,
    );
    await pay(staff, lease.id, "123456.78");
    await pay(staff, other.id, "40000");

    const report = await overdueReport(staff, NOW);
    const dash = await getDashboard(staff, NOW);
    const ledgers = await Promise.all([
      getLeaseLedger(staff, lease.id, NOW),
      getLeaseLedger(staff, other.id, NOW),
    ]);
    const grid = await listLeases(staff, { overdueOnly: true }, NOW);

    const sum = (xs: string[]) => xs.reduce((s, x) => s + Math.round(Number(x) * 100), 0) / 100;
    expect(dash.leases?.overdueTotal).toBe(report.total);
    expect(sum(ledgers.map((l) => l.totals.overdue)).toFixed(2)).toBe(report.total);
    expect(sum(grid.map((r) => r.overdue!)).toFixed(2)).toBe(report.total);
    expect(sum(report.rows.map((r) => r.overdue)).toFixed(2)).toBe(report.total);
    expect(sum(Object.values(report.buckets)).toFixed(2)).toBe(report.total);
    expect(report.rows.map((r) => r.refNo)).toEqual([other.refNo, lease.refNo]); // oldest debt first

    const csv = await exportOverdue(staff, "csv", meta, NOW);
    expect(csv.count).toBe(2);
    expect(csv.body.toString("utf8")).toContain(other.refNo);
    const audit = await db.auditLog.findFirst({
      where: { action: "data.export", entityType: "Payment" },
    });
    expect(audit?.metadata).toMatchObject({ format: "csv", rows: 2, report: "overdue" });
  });
});

describe("Viewers", () => {
  it("are refused by every payment service", async () => {
    const { viewer, lease } = await setup();
    const attempts = [
      getLeaseLedger(viewer, lease.id),
      recordPayment(viewer, {}, meta),
      voidPayment(viewer, lease.id, {}, meta),
      applyCredit(viewer, lease.id, meta),
      openChargesForPayment(viewer, lease.id),
      listPayments(viewer),
      overdueReport(viewer),
      addOtherCharge(viewer, lease.id, {}, meta),
      voidCharge(viewer, lease.id, {}, meta),
      getPaymentAcknowledgement(viewer, lease.id),
      exportOverdue(viewer, "csv", meta),
    ];
    for (const a of attempts) await expect(a).rejects.toBeInstanceOf(ForbiddenError);
  });
});
