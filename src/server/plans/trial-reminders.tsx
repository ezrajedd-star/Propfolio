import { render } from "@react-email/render";

import { isAdminRole } from "@/domain/auth/roles";
import { PLAN_CONFIG, trialReminderDue } from "@/domain/plans/plans";
import { daysBetween } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { asSystem, db, runInAccount } from "@/server/db";
import { env } from "@/server/env";
import { TrialEndingEmail } from "@/server/mail/templates/account-emails";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import { getSettings } from "@/server/settings/service";

export interface TrialReminderDeps {
  /** Sends the email; replaced in tests to simulate failures. */
  send: (mail: OutgoingMail, fromName: string) => Promise<void>;
}

export interface TrialReminderResult {
  sent: number;
  failed: number;
}

/**
 * "Your trial ends soon" emails, 7 days and 1 day before (TRIAL_REMINDER_DAYS), to each active
 * account's Owner and Admins. The worker runs it daily. Idempotent: each trial end and lead time
 * is claimed in TrialReminder before sending, and released again if sending fails (so a retry
 * sends it). `now` and `deps` are injectable for tests.
 */
export async function sendTrialReminders(
  now = new Date(),
  deps: TrialReminderDeps = { send: deliver },
): Promise<TrialReminderResult> {
  const today = manilaToday(now);
  const accounts = await asSystem(() =>
    db.account.findMany({
      where: {
        status: "ACTIVE",
        trialEndsAt: { gt: now, lte: new Date(now.getTime() + 9 * 86_400_000) },
      },
      select: {
        id: true,
        trialEndsAt: true,
        paidUntil: true,
        plan: true,
        trialReminders: { select: { trialEndsAt: true, daysBefore: true } },
        memberships: {
          where: { isActive: true },
          select: { role: true, user: { select: { name: true, email: true } } },
        },
      },
    }),
  );

  const result: TrialReminderResult = { sent: 0, failed: 0 };
  for (const a of accounts) {
    const endsAt = a.trialEndsAt!;
    // Someone already paying for Premium isn't reminded about the trial.
    if (a.plan === "PREMIUM" && a.paidUntil && a.paidUntil >= new Date(today)) continue;
    const lastDay = manilaToday(new Date(endsAt.getTime() - 1));
    const daysLeft = daysBetween(today, lastDay);
    const sentForThisEnd = a.trialReminders
      .filter((r) => r.trialEndsAt.getTime() === endsAt.getTime())
      .map((r) => r.daysBefore);
    const due = trialReminderDue(daysLeft, sentForThisEnd);
    if (due === null) continue;
    const recipients = a.memberships.filter((m) => isAdminRole(m.role));
    if (recipients.length === 0) continue;

    // Claim it first: a second worker (or a retry) finds the row and skips.
    const claim = await asSystem(() =>
      db.trialReminder
        .create({
          data: {
            accountId: a.id,
            trialEndsAt: endsAt,
            daysBefore: due,
            recipients: recipients.length,
          },
        })
        .catch(() => null),
    );
    if (!claim) continue;
    try {
      const daysLeftText =
        daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
      await runInAccount(a.id, async () => {
        const settings = await getSettings();
        for (const r of recipients) {
          const element = (
            <TrialEndingEmail
              companyName={settings.companyName}
              name={r.user.name}
              lastDay={formatIsoDate(lastDay)}
              daysLeftText={daysLeftText}
              planUrl={`${env().APP_URL.replace(/\/$/, "")}/plan`}
              freeUnits={PLAN_CONFIG.FREE.units}
            />
          );
          const [html, text] = await Promise.all([
            render(element),
            render(element, { plainText: true }),
          ]);
          await deps.send(
            {
              to: [r.user.email],
              subject: `Your free Premium trial ends ${daysLeftText}`,
              html,
              text,
              replyTo: settings.mailReplyTo || undefined,
            },
            settings.mailFromName,
          );
        }
      });
      result.sent++;
    } catch (err) {
      // Release the claim so the next run tries again. No addresses in logs.
      await asSystem(() => db.trialReminder.delete({ where: { id: claim.id } }));
      console.error("[trial-reminders] send failed:", (err as Error).name);
      result.failed++;
    }
  }
  if (result.failed > 0) throw new Error(`Trial reminders failed for ${result.failed} account(s)`);
  return result;
}
