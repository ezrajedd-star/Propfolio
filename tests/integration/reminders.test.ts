import { beforeEach, describe, expect, it } from "vitest";

import { fromDbDate } from "@/domain/time/calendar-date";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { createLease, renewLease, terminateLease, updateLease } from "@/server/leases/service";
import { logOutbox, type OutgoingMail } from "@/server/mail/transport";
import { setUnitReminderOverride } from "@/server/property/units";
import { sendDailyDigest } from "@/server/reminders/digest-job";
import { markReminderHandled, unmarkReminderHandled } from "@/server/reminders/handled";
import { syncReminders } from "@/server/reminders/sync";
import { updateSettings } from "@/server/settings/service";
import { makeProperty, makeTenant, makeUser, meta, resetDb, terms } from "./helpers";

beforeEach(resetDb);

/** 06:00 Asia/Manila on the given date (22:00 UTC the day before). */
const at6am = (date: string) => new Date(`${date}T06:00:00+08:00`);
const CREATED = at6am("2026-07-01");

async function pendingDates(leaseId: string) {
  const rows = await db.reminderEvent.findMany({
    where: { leaseId, status: "PENDING" },
    orderBy: { scheduledDate: "asc" },
  });
  return rows.map((r) => fromDbDate(r.scheduledDate));
}

async function setup() {
  const admin = await makeUser("ADMIN", { email: "admin@example.test" });
  const staff = await makeUser("LEASING_STAFF", { email: "staff@example.test" });
  await makeUser("VIEWER", { email: "viewer@example.test" });
  await makeUser("LEASING_STAFF", { email: "gone@example.test", isActive: false });
  // Office type: 90/60/30 days, no repeats.
  const { units, unitType } = await makeProperty(admin, { units: ["101", "102"] });
  const tenant = await makeTenant(staff);
  // Ends 31 Dec 2026 → reminders on 2 Oct, 1 Nov, 1 Dec.
  const lease = await createLease(
    staff,
    {
      unitId: units[0]!.id,
      tenantId: tenant.id,
      ...terms({ startDate: "2026-01-01", endDate: "2026-12-31" }),
    },
    meta,
    CREATED,
  );
  return { admin, staff, units, unitType, tenant, lease };
}

describe("reminder schedule records", () => {
  it("are created with the lease from the unit's effective settings", async () => {
    const { lease } = await setup();
    expect(await pendingDates(lease.id)).toEqual(["2026-10-02", "2026-11-01", "2026-12-01"]);
  });

  it("follow changes to the lease dates and to the unit's settings, but only in the future", async () => {
    const { staff, admin, lease, units, tenant } = await setup();
    await updateLease(
      staff,
      lease.id,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-01-01", endDate: "2027-01-31" }),
      },
      meta,
      CREATED,
    );
    expect(await pendingDates(lease.id)).toEqual(["2026-11-02", "2026-12-02", "2027-01-01"]);

    await setUnitReminderOverride(
      admin,
      units[0]!.id,
      {
        reminderConfig: { leadDays: [14], repeat: "NONE", repeatWeekday: null, afterExpiryDays: 0 },
      },
      meta,
    );
    expect(await pendingDates(lease.id)).toEqual(["2027-01-17"]);
  });

  it("follow the system default when the unit type has none", async () => {
    const admin = await makeUser("ADMIN");
    const { units } = await makeProperty(admin, { reminderConfig: null });
    const tenant = await makeTenant(admin);
    const l = await createLease(
      admin,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-01-01", endDate: "2026-12-31" }),
      },
      meta,
      CREATED,
    );
    await updateSettings(
      admin,
      {
        reminderDefaults: {
          leadDays: [45],
          repeat: "NONE",
          repeatWeekday: null,
          afterExpiryDays: 0,
        },
      },
      meta,
    );
    expect(await pendingDates(l.id)).toEqual(["2026-11-16"]);
  });

  it("stop when the lease is renewed, terminated or handled", async () => {
    const { staff, lease, units, tenant } = await setup();
    await markReminderHandled(
      staff,
      lease.id,
      { note: "Tenant confirmed renewal by phone" },
      meta,
      CREATED,
    );
    expect(await pendingDates(lease.id)).toEqual([]);
    await unmarkReminderHandled(staff, lease.id, meta, CREATED);
    expect(await pendingDates(lease.id)).toHaveLength(3);

    const renewal = await renewLease(
      staff,
      lease.id,
      terms({ startDate: "2027-01-01", endDate: "2027-12-31" }),
      meta,
      CREATED,
    );
    expect(await pendingDates(lease.id)).toEqual([]);
    expect(await pendingDates(renewal.id)).toEqual(["2027-10-02", "2027-11-01", "2027-12-01"]);

    const other = await createLease(
      staff,
      {
        unitId: units[1]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-01-01", endDate: "2026-12-31" }),
      },
      meta,
      CREATED,
    );
    await terminateLease(
      staff,
      other.id,
      { terminationDate: "2026-08-31", reason: "Ended by agreement" },
      meta,
      CREATED,
    );
    expect(await pendingDates(other.id)).toEqual([]);
  });

  it("include weekly repeats until 30 days after the end", async () => {
    const admin = await makeUser("ADMIN");
    const { units } = await makeProperty(admin, {
      reminderConfig: { leadDays: [30], repeat: "WEEKLY", repeatWeekday: 1, afterExpiryDays: 30 },
    });
    const tenant = await makeTenant(admin);
    const l = await createLease(
      admin,
      {
        unitId: units[0]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-01-01", endDate: "2027-01-31" }),
      },
      meta,
      CREATED,
    );
    const dates = await pendingDates(l.id);
    expect(dates[0]).toBe("2027-01-01");
    expect(dates.at(-1)).toBe("2027-03-01");
  });

  it("is refused to Viewers", async () => {
    const { lease } = await setup();
    const viewer = await db.user.findFirstOrThrow({ where: { role: "VIEWER" } });
    await expect(
      markReminderHandled({ id: viewer.id, name: viewer.name, role: "VIEWER" }, lease.id, {}, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("daily digest", () => {
  it("sends nothing on a day with no reminders", async () => {
    await setup();
    expect(await sendDailyDigest(at6am("2026-09-15"))).toEqual({ status: "EMPTY" });
    expect(logOutbox).toHaveLength(0);
  });

  it("sends one email to every active Admin and Leasing Staff user, never to Viewers", async () => {
    const { lease, staff, units, tenant } = await setup();
    // A second lease with a reminder on the same day → still one email.
    await createLease(
      staff,
      {
        unitId: units[1]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-02-01", endDate: "2026-12-31" }),
      },
      meta,
      CREATED,
    );

    const result = await sendDailyDigest(at6am("2026-10-02"));
    expect(result).toEqual({ status: "SENT", leaseCount: 2, recipientCount: 2 });
    expect(logOutbox).toHaveLength(1);
    const mail = logOutbox[0]!;
    expect(mail.to.sort()).toEqual(["admin@example.test", "staff@example.test"]);
    expect(mail.to).not.toContain("viewer@example.test");
    expect(mail.to).not.toContain("gone@example.test");
    expect(mail.subject).toBe("Lease reminders – 2 leases need attention (2 Oct 2026)");
    expect(mail.text).toContain(`http://localhost:3000/leases/${lease.id}`);
    expect(mail.text).toContain("90-day reminder before the lease ends");

    const ev = await db.reminderEvent.findFirstOrThrow({
      where: { leaseId: lease.id, scheduledDate: new Date("2026-10-02") },
    });
    expect(ev.status).toBe("SENT");
  });

  it("is idempotent: a second run the same day sends nothing", async () => {
    await setup();
    await sendDailyDigest(at6am("2026-10-02"));
    expect(await sendDailyDigest(new Date("2026-10-02T09:00:00+08:00"))).toEqual({
      status: "ALREADY_DONE",
      previous: "SENT",
    });
    expect(logOutbox).toHaveLength(1);
  });

  it("records failures, retries, and never puts addresses in the error", async () => {
    const { lease } = await setup();
    const failing = {
      send: async (m: OutgoingMail) => {
        throw new Error(`550 mailbox ${m.to[0]} unavailable`);
      },
    };
    await expect(sendDailyDigest(at6am("2026-10-02"), failing)).rejects.toThrow();
    const failed = await db.reminderDigest.findFirstOrThrow();
    expect(failed).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(failed.lastError).toContain("[address]");
    expect(failed.lastError).not.toContain("@example.test");
    expect(
      (
        await db.reminderEvent.findFirstOrThrow({
          where: { scheduledDate: new Date("2026-10-02") },
        })
      ).status,
    ).toBe("FAILED");

    // The retry (e.g. 10 minutes later) succeeds.
    expect(await sendDailyDigest(new Date("2026-10-02T06:10:00+08:00"))).toMatchObject({
      status: "SENT",
      leaseCount: 1,
    });
    expect(await db.reminderDigest.findFirstOrThrow()).toMatchObject({
      status: "SENT",
      attempts: 2,
      lastError: null,
    });
    const actions = (
      await db.auditLog.findMany({
        where: { entityType: "ReminderDigest" },
        orderBy: { seq: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(["reminder.digest_failed", "reminder.digest_sent"]);
    expect(lease).toBeTruthy();
  });

  it("catches up on a missed day, but not on reminders older than a week", async () => {
    await setup();
    // Worker was down on 2 Oct; on 5 Oct the 90-day reminder still goes out.
    const r = await sendDailyDigest(at6am("2026-10-05"));
    expect(r).toMatchObject({ status: "SENT", leaseCount: 1 });
    expect(logOutbox[0]?.text).toContain("(was due 2 Oct 2026)");
  });

  it("a failed reminder is retried the next day, together with that day's reminders", async () => {
    const { staff, units, tenant } = await setup();
    await expect(
      sendDailyDigest(at6am("2026-10-02"), {
        send: async () => {
          throw new Error("SMTP down");
        },
      }),
    ).rejects.toThrow();
    await createLease(
      staff,
      {
        unitId: units[1]!.id,
        tenantId: tenant.id,
        ...terms({ startDate: "2026-02-01", endDate: "2027-01-01" }),
      },
      meta,
      CREATED,
    );
    const r = await sendDailyDigest(at6am("2026-10-03"));
    expect(r).toMatchObject({ status: "SENT", leaseCount: 2 });
  });

  it("stops reminding about a lease once it is marked as handled", async () => {
    const { lease, staff } = await setup();
    await sendDailyDigest(at6am("2026-10-02"));
    await markReminderHandled(staff, lease.id, {}, meta, at6am("2026-10-10"));
    expect(await sendDailyDigest(at6am("2026-11-01"))).toEqual({ status: "EMPTY" });
    expect(logOutbox).toHaveLength(1);
    const statuses = await db.reminderEvent.findMany({ where: { leaseId: lease.id } });
    expect(statuses.map((s) => s.status)).toEqual(["SENT"]);
  });

  it("does not resend a failed reminder once the lease is renewed", async () => {
    const { lease, staff } = await setup();
    await expect(
      sendDailyDigest(at6am("2026-10-02"), {
        send: async () => {
          throw new Error("down");
        },
      }),
    ).rejects.toThrow();
    await renewLease(
      staff,
      lease.id,
      terms({ startDate: "2027-01-01", endDate: "2027-12-31" }),
      meta,
      at6am("2026-10-02"),
    );
    expect(await sendDailyDigest(at6am("2026-10-03"))).toEqual({ status: "EMPTY" });
    expect((await db.reminderEvent.findFirstOrThrow({ where: { leaseId: lease.id } })).status).toBe(
      "SKIPPED",
    );
  });

  it("fails clearly when there is nobody to send to", async () => {
    await setup();
    await db.user.updateMany({
      where: { role: { in: ["ADMIN", "LEASING_STAFF"] } },
      data: { isActive: false },
    });
    await expect(sendDailyDigest(at6am("2026-10-02"))).rejects.toThrow(
      /no active Admin or Leasing Staff/,
    );
  });

  it("keeps sync idempotent", async () => {
    const { lease } = await setup();
    await syncReminders("all", CREATED);
    await syncReminders("all", CREATED);
    expect(await pendingDates(lease.id)).toEqual(["2026-10-02", "2026-11-01", "2026-12-01"]);
  });
});
