import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { deliver, type OutgoingMail } from "@/server/mail/transport";

/**
 * A burst of failed sign-ins (someone guessing passwords, across all accounts) emails the
 * platform admins, at most once an hour. The email has counts only: no emails, names or
 * addresses. Run every 10 minutes by the worker.
 */
export const FAILED_SIGN_IN_ALERT = {
  /** Look at the last 15 minutes… */
  windowMinutes: 15,
  /** …and alert at 30 or more failed sign-ins… */
  threshold: 30,
  /** …but not more than once an hour. */
  quietMinutes: 60,
} as const;

const FAILED_ACTIONS = ["auth.login_failed", "platform.login_failed"];

export interface AlertOutcome {
  failed: number;
  alerted: boolean;
}

export function checkFailedSignIns(
  now = new Date(),
  send: (mail: OutgoingMail, fromName: string) => Promise<void> = deliver,
): Promise<AlertOutcome> {
  const { windowMinutes, threshold, quietMinutes } = FAILED_SIGN_IN_ALERT;
  return asSystem(async () => {
    const since = new Date(now.getTime() - windowMinutes * 60_000);
    const [summary] = await db.$queryRaw<
      { failed: bigint; addresses: bigint; accounts: bigint; locked: bigint }[]
    >`
      SELECT count(*) AS failed,
             count(DISTINCT "ipAddress") AS addresses,
             count(DISTINCT "accountId") AS accounts,
             count(*) FILTER (WHERE "metadata"->>'reason' = 'locked') AS locked
      FROM "AuditLog"
      WHERE "action" = ANY(${FAILED_ACTIONS}) AND "at" >= ${since}`;
    const failed = Number(summary!.failed);
    if (failed < threshold) return { failed, alerted: false };

    const recent = await db.auditLog.count({
      where: {
        action: "monitoring.failed_sign_in_alert",
        at: { gte: new Date(now.getTime() - quietMinutes * 60_000) },
      },
    });
    if (recent > 0) return { failed, alerted: false };

    const admins = await db.platformAdmin.findMany({
      where: { isActive: true, totpConfirmedAt: { not: null } },
      select: { email: true },
    });
    const facts = {
      failed,
      minutes: windowMinutes,
      addresses: Number(summary!.addresses),
      accounts: Number(summary!.accounts),
      lockedAttempts: Number(summary!.locked),
    };
    if (admins.length > 0) {
      const lines = [
        `${failed} failed sign-ins in the last ${windowMinutes} minutes (the alert starts at ${threshold}).`,
        `They came from ${facts.addresses} internet address(es) and concern ${facts.accounts} customer account(s).`,
        `${facts.lockedAttempts} were attempts on accounts already locked after 5 wrong passwords.`,
        "",
        "Propfolio already slows this down (rate limits and lockouts). If it keeps happening, look at the audit log in the server, or ask your developer.",
        `This alert is sent at most once every ${quietMinutes} minutes.`,
      ];
      await send(
        {
          to: admins.map((a) => a.email),
          subject: `Propfolio alert: ${failed} failed sign-ins in ${windowMinutes} minutes`,
          text: lines.join("\n"),
          html: lines.map((l) => (l ? `<p>${l}</p>` : "")).join(""),
        },
        "Propfolio monitoring",
      );
    }
    // Written directly (not via writeAudit) to record the check's own time, which the quiet
    // period above is measured against.
    await db.auditLog.create({
      data: {
        at: now,
        action: "monitoring.failed_sign_in_alert",
        entityType: "Platform",
        metadata: { ...facts, recipients: admins.length, appUrl: env().APP_URL },
        accountId: null,
      },
    });
    return { failed, alerted: true };
  });
}
