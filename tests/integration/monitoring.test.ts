import { beforeEach, describe, expect, it } from "vitest";

import { asSystem, db } from "@/server/db";
import type { OutgoingMail } from "@/server/mail/transport";
import { FAILED_SIGN_IN_ALERT, checkFailedSignIns } from "@/server/monitoring/sign-in-alert";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-11-03T02:00:00Z");

async function failedSignIns(count: number, at: Date) {
  await asSystem(async () => {
    for (let i = 0; i < count; i++) {
      await db.auditLog.create({
        data: {
          action: "auth.login_failed",
          entityType: "User",
          at,
          metadata: { reason: i % 5 === 0 ? "locked" : "wrong_password" },
          ipAddress: `192.0.2.${i % 3}`,
          accountId: null,
        },
      });
    }
  });
}

async function platformAdmin() {
  await asSystem(() =>
    db.platformAdmin.create({
      data: { email: "ops@propfolio.test", name: "Ops", totpConfirmedAt: NOW },
    }),
  );
}

describe("failed sign-in alert", () => {
  it("stays quiet below the threshold", async () => {
    await platformAdmin();
    await failedSignIns(FAILED_SIGN_IN_ALERT.threshold - 1, new Date(NOW.getTime() - 60_000));
    const sent: OutgoingMail[] = [];
    expect(await checkFailedSignIns(NOW, async (m) => void sent.push(m))).toEqual({
      failed: FAILED_SIGN_IN_ALERT.threshold - 1,
      alerted: false,
    });
    expect(sent).toHaveLength(0);
  });

  it("emails platform admins counts only, then waits an hour before alerting again", async () => {
    await platformAdmin();
    await failedSignIns(40, new Date(NOW.getTime() - 5 * 60_000));
    // Older than 15 minutes: not counted.
    await failedSignIns(10, new Date(NOW.getTime() - 20 * 60_000));
    const sent: OutgoingMail[] = [];
    const send = async (m: OutgoingMail) => void sent.push(m);

    expect(await checkFailedSignIns(NOW, send)).toEqual({ failed: 40, alerted: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(["ops@propfolio.test"]);
    expect(sent[0]!.subject).toBe("Propfolio alert: 40 failed sign-ins in 15 minutes");
    expect(sent[0]!.text).toContain("3 internet address(es)");
    expect(sent[0]!.text).toContain("8 were attempts on accounts already locked");
    expect(sent[0]!.text).not.toMatch(/192\.0\.2|@/);

    expect((await checkFailedSignIns(new Date(NOW.getTime() + 30 * 60_000), send)).alerted).toBe(
      false,
    );
    await failedSignIns(40, new Date(NOW.getTime() + 65 * 60_000));
    expect((await checkFailedSignIns(new Date(NOW.getTime() + 70 * 60_000), send)).alerted).toBe(
      true,
    );
    expect(sent).toHaveLength(2);
  });

  it("records the alert in the audit log even with no platform admin to email", async () => {
    await failedSignIns(35, NOW);
    expect((await checkFailedSignIns(NOW, async () => undefined)).alerted).toBe(true);
    const row = await asSystem(() =>
      db.auditLog.findFirstOrThrow({ where: { action: "monitoring.failed_sign_in_alert" } }),
    );
    expect(row).toMatchObject({ accountId: null, metadata: { failed: 35, recipients: 0 } });
  });
});
