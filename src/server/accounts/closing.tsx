import { render } from "@react-email/render";

import { closedAccountStep, confirmsName, deleteAfterFor } from "@/domain/accounts/closing";
import { fromDbDate, toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { writeAudit } from "@/server/audit";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { randomToken, sha256 } from "@/server/auth/tokens";
import { asSystem, db } from "@/server/db";
import { storage } from "@/server/documents/storage";
import { isUuid } from "@/server/db-errors";
import { env } from "@/server/env";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { SubscriptionEmail } from "@/server/mail/templates/account-emails";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { closeAccountSchema } from "@/schemas/account";

/**
 * Closing an account (owner's decision 3: keep the data 90 days, remind them to download it,
 * then delete it). Closing signs everyone out and stops all emails and charges at once. Until
 * the deletion date the Owner can reopen it from the link in the closing email (or Propfolio's
 * platform admin can). After it, the daily job deletes the account's data; only Propfolio's own
 * payment records stay, under an anonymised account row, for the bookkeeper and BIR.
 */
export interface ClosingDeps {
  send: (mail: OutgoingMail) => Promise<void>;
}
const defaultDeps: ClosingDeps = { send: (m) => deliver(m, "Propfolio") };

const appUrl = (path: string) => `${env().APP_URL.replace(/\/$/, "")}${path}`;

async function emailOwner(
  accountId: string,
  subject: string,
  paragraphs: string[],
  deps: ClosingDeps,
  button?: { text: string; url: string },
  owner?: { name: string; email: string; accountName: string },
) {
  try {
    const o =
      owner ??
      (await asSystem(async () => {
        const m = await db.membership.findFirst({
          where: { accountId, role: "OWNER" },
          select: {
            user: { select: { name: true, email: true } },
            account: { select: { name: true } },
          },
        });
        return m ? { name: m.user.name, email: m.user.email, accountName: m.account.name } : null;
      }));
    if (!o) return;
    const element = (
      <SubscriptionEmail
        companyName={o.accountName}
        name={o.name}
        preview={subject}
        paragraphs={paragraphs}
        buttonText={button?.text}
        buttonUrl={button?.url}
      />
    );
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await deps.send({ to: [o.email], subject, html, text });
  } catch (err) {
    // The type of error only: never the address.
    console.error("[account-closing] email not sent:", (err as Error).name);
  }
}

/** The Owner closes the account, after typing its name. */
export async function closeAccount(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  deps: ClosingDeps = defaultDeps,
): Promise<{ deleteAfter: IsoDate }> {
  assertCan(actor, "billing.manage", { duringReadOnly: true });
  const { confirmName } = parseInput(closeAccountSchema, input);
  const token = randomToken();
  const deleteAfter = deleteAfterFor(manilaToday(now));
  const account = await asSystem(() =>
    db.$transaction(async (tx) => {
      const a = await tx.account.findUniqueOrThrow({ where: { id: actor.accountId } });
      if (a.status !== "ACTIVE") throw new ConflictError("This account is already closed.");
      if (!confirmsName(confirmName, a.name)) {
        throw new ValidationError("That isn't your account's name.", {
          confirmName: `Type the name exactly as shown: ${a.name}`,
        });
      }
      await tx.account.update({
        where: { id: a.id },
        data: {
          status: "CLOSED",
          closedAt: now,
          deleteAfter: toDbDate(deleteAfter),
          reopenTokenHash: sha256(token),
          deletionReminderSentAt: null,
        },
      });
      // Nothing more is charged; the subscription simply ends.
      await tx.subscription.updateMany({
        where: { accountId: a.id, status: { not: "CANCELED" } },
        data: { status: "CANCELED", cancelAtPeriodEnd: false, pendingPlan: null },
      });
      await tx.invitation.updateMany({
        where: { accountId: a.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      // Everyone is signed out of this account at once.
      await tx.session.updateMany({
        where: { accountId: a.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await writeAudit(
        {
          actor: { id: actor.id, name: actor.name, role: actor.role },
          action: "account.closed",
          entityType: "Account",
          entityId: a.id,
          metadata: { deleteAfter },
          meta,
          accountId: a.id,
        },
        tx,
      );
      return a;
    }),
  );
  await emailOwner(
    account.id,
    "Your Propfolio account is closed",
    [
      `You closed ${account.name}'s Propfolio account. Nobody can sign in to it now, and no reminder emails or charges will go out.`,
      `Changed your mind? You can reopen it, with everything as it was, until ${formatIsoDate(deleteAfter)}. After that day all its data (buildings, tenants, leases, payments and documents) is deleted for good.`,
      "This link reopens the account. Keep this email; anyone with the link can reopen it.",
    ],
    deps,
    { text: "Reopen my account", url: appUrl(`/reopen-account/${token}`) },
    { name: actor.name, email: actor.email, accountName: account.name },
  );
  return { deleteAfter };
}

/** The account a reopen link is for, if it can still be reopened. */
export async function reopenableAccount(token: string, now = new Date()) {
  if (!token || token.length > 200) return null;
  const a = await asSystem(() =>
    db.account.findUnique({
      where: { reopenTokenHash: sha256(token) },
      select: { id: true, name: true, status: true, deleteAfter: true },
    }),
  );
  if (!a || a.status !== "CLOSED" || !a.deleteAfter) return null;
  if (manilaToday(now) > fromDbDate(a.deleteAfter)) return null;
  return { id: a.id, name: a.name, deleteAfter: fromDbDate(a.deleteAfter) };
}

async function reopen(
  accountId: string,
  admin: PlatformActor | null,
  how: "link" | "platform",
  meta: RequestMeta,
) {
  return asSystem(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.account.updateMany({
        where: { id: accountId, status: "CLOSED", dataDeletedAt: null },
        data: {
          status: "ACTIVE",
          closedAt: null,
          deleteAfter: null,
          reopenTokenHash: null,
          deletionReminderSentAt: null,
        },
      });
      if (count !== 1) return false;
      if (admin) {
        await writeStaffLog(
          {
            actor: admin,
            kind: "CHANGE",
            action: "platform.account_reopened",
            entityType: "Account",
            entityId: accountId,
            accountId,
            meta,
          },
          tx,
        );
      }
      await writeAudit(
        {
          actor: admin ? { id: admin.id, name: admin.name, role: null } : null,
          action: "account.reopened",
          entityType: "Account",
          entityId: accountId,
          metadata: { how, ...(how === "platform" ? { platform: true } : {}) },
          meta,
          accountId,
        },
        tx,
      );
      return true;
    }),
  );
}

/** The Owner's "Reopen my account" link. Everything comes back as it was (on the Free plan or
 * whatever the plan rules give it; a cancelled subscription isn't restarted). */
export async function reopenAccountWithLink(token: string, meta: RequestMeta, now = new Date()) {
  const a = await reopenableAccount(token, now);
  if (!a) throw new NotFoundError("This link has expired or was already used.");
  if (!(await reopen(a.id, null, "link", meta))) {
    throw new NotFoundError("This link has expired or was already used.");
  }
  return { name: a.name };
}

/** Propfolio staff reopen a closed account (the Owner lost the email). */
export async function platformReopenAccount(
  admin: PlatformActor,
  accountId: string,
  meta: RequestMeta,
) {
  assertPlatformCan(admin, "billing.manage");
  if (!isUuid(accountId)) throw new NotFoundError("We couldn't find that account.");
  const ok = await reopen(accountId, admin, "platform", meta);
  if (!ok)
    throw new ConflictError("Only a closed account whose data is still kept can be reopened.");
}

/**
 * Delete a closed account's data. Children first; the audit log's own guard lets only this
 * transaction remove only this account's entries. Users who belong to no other account are
 * deleted too. Kept: the account row (anonymised) and Propfolio's payment records for it.
 * Stored files are removed after the database commit.
 */
export async function deleteClosedAccountData(accountId: string, now = new Date()): Promise<void> {
  const files = await asSystem(() =>
    db.$transaction(
      async (tx) => {
        const a = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
        if (a.status !== "CLOSED" || a.dataDeletedAt) {
          throw new ConflictError("Only a closed account's data can be deleted.");
        }
        await tx.$executeRaw`SELECT set_config('propfolio.purge_account', ${accountId}, true)`;
        const docs = await tx.document.findMany({
          where: { accountId },
          select: { storageKey: true },
        });
        const members = await tx.membership.findMany({
          where: { accountId },
          select: { userId: true },
        });

        const del = (table: string) =>
          tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "accountId" = $1::uuid`, accountId);
        await tx.$executeRaw`UPDATE "Lease" SET "previousLeaseId" = NULL WHERE "accountId" = ${accountId}::uuid`;
        for (const table of [
          "PaymentAllocation",
          "Payment",
          "Charge",
          "ReminderEvent",
          "ReminderDigest",
          "Document",
          "LeaseDraft",
          "Lease",
          "LeaseCounter",
          "PaymentCounter",
          "Unit",
          "UnitType",
          "Building",
          "Tenant",
          "Setting",
          "UserPreference",
          "Feedback",
          "Invitation",
          "TrialReminder",
          "SignInChallenge",
          "Session",
          "Subscription",
          "Membership",
          "AuditLog",
        ]) {
          await del(table);
        }
        // People who belonged only to this account.
        const userIds = [...new Set(members.map((m) => m.userId))];
        if (userIds.length) {
          const stillMembers = await tx.membership.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true },
          });
          const keep = new Set(stillMembers.map((m) => m.userId));
          const gone = userIds.filter((id) => !keep.has(id));
          if (gone.length) await tx.user.deleteMany({ where: { id: { in: gone } } });
        }
        await tx.account.update({
          where: { id: accountId },
          data: {
            name: "Closed account",
            dataDeletedAt: now,
            reopenTokenHash: null,
          },
        });
        await writeAudit(
          {
            actor: null,
            action: "account.data_deleted",
            entityType: "Account",
            entityId: accountId,
            metadata: { documents: docs.length, people: userIds.length },
            meta: { ipAddress: null, userAgent: "housekeeping" },
            accountId,
          },
          tx,
        );
        return docs.map((d) => d.storageKey);
      },
      { timeout: 120_000 },
    ),
  );
  for (const key of files) {
    await storage()
      .remove(key)
      .catch((err: unknown) =>
        console.error("[account-closing] file not removed:", (err as Error).name),
      );
  }
}

/** Daily: remind Owners a week before their closed account's data goes; then delete it. */
export async function runClosedAccounts(
  now = new Date(),
  deps: ClosingDeps = defaultDeps,
): Promise<{ reminded: number; deleted: number }> {
  const today = manilaToday(now);
  const closed = await asSystem(() =>
    db.account.findMany({
      where: { status: "CLOSED", dataDeletedAt: null, deleteAfter: { not: null } },
      select: { id: true, name: true, deleteAfter: true, deletionReminderSentAt: true },
    }),
  );
  const result = { reminded: 0, deleted: 0 };
  for (const a of closed) {
    const deleteAfter = fromDbDate(a.deleteAfter!);
    const step = closedAccountStep(deleteAfter, today, a.deletionReminderSentAt !== null);
    if (step === "delete") {
      await deleteClosedAccountData(a.id, now);
      result.deleted++;
    } else if (step === "remind") {
      // A fresh link: the first one may be lost.
      const token = randomToken();
      await asSystem(() =>
        db.account.update({
          where: { id: a.id },
          data: { deletionReminderSentAt: now, reopenTokenHash: sha256(token) },
        }),
      );
      await emailOwner(
        a.id,
        "Your Propfolio data will be deleted soon",
        [
          `${a.name}'s closed Propfolio account, and all its data, will be deleted after ${formatIsoDate(deleteAfter)}.`,
          "To keep a copy, reopen the account, download your data (Settings → Your data), then close it again. Or do nothing, and it will be deleted as planned.",
        ],
        deps,
        { text: "Reopen my account", url: appUrl(`/reopen-account/${token}`) },
      );
      result.reminded++;
    }
  }
  return result;
}
