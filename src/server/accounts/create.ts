import { randomBytes } from "node:crypto";

import { SIGNUP_TWO_STEP_GRACE_DAYS } from "@/domain/auth/signup";
import { currentVersions } from "@/domain/legal/documents";
import { trialEndsAtFor } from "@/domain/plans/plans";
import { UNIT_TYPE_REMINDER_DEFAULTS } from "@/domain/reminders/config";
import { writeAudit } from "@/server/audit";
import { hashPassword } from "@/server/auth/password";
import { asSystem, db } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";
import { recordFunnelStep } from "./funnel";

export interface NewAccount {
  /** The person: their name and (verified) email. */
  name: string;
  email: string;
  /** The name they lease under (company or personal): the account's name. */
  companyName: string;
  /** An argon2 hash (email sign-up), or null for Google: they get an unusable random one. */
  passwordHash: string | null;
  googleSub: string | null;
}

/**
 * A new customer account from self-serve sign-up: the account (Premium trial running), its first
 * person as Owner, the standard unit types, privacy contact defaults, and the accepted legal
 * versions. One transaction: either all of it exists, or none of it.
 */
export async function createAccountWithOwner(
  input: NewAccount,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ accountId: string; userId: string }> {
  // Google-only people get a random password nobody knows; "Forgot password?" can set a real one.
  const passwordHash = input.passwordHash ?? (await hashPassword(randomBytes(32).toString("hex")));
  const result = await asSystem(() =>
    db.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: { name: input.companyName, plan: "PREMIUM", trialEndsAt: trialEndsAtFor(now) },
      });
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          googleSub: input.googleSub,
          mustChangePassword: false,
          passwordChangedAt: now,
          // Two-step sign-in is an onboarding step, not the first thing they see.
          twoStepGraceUntil: new Date(now.getTime() + SIGNUP_TWO_STEP_GRACE_DAYS * 86_400_000),
        },
      });
      await tx.membership.create({
        data: { accountId: account.id, userId: user.id, role: "OWNER", lastUsedAt: now },
      });
      await tx.unitType.createMany({
        data: Object.entries(UNIT_TYPE_REMINDER_DEFAULTS).map(([name, reminderConfig], i) => ({
          accountId: account.id,
          name,
          reminderConfig,
          sortOrder: i + 1,
          createdById: user.id,
          updatedById: user.id,
        })),
      });
      // Privacy questions go to the Owner until they name someone else (Settings → Privacy).
      await tx.setting.createMany({
        data: [
          { accountId: account.id, key: "dpoName", value: input.name, createdById: user.id },
          { accountId: account.id, key: "dpoEmail", value: input.email, createdById: user.id },
          {
            accountId: account.id,
            key: "mailFromName",
            value: input.companyName.slice(0, 80),
            createdById: user.id,
          },
        ],
      });
      await tx.legalAcceptance.createMany({
        data: currentVersions().map((v) => ({
          userId: user.id,
          document: v.document,
          version: v.version,
          acceptedAt: now,
          ipAddress: meta.ipAddress,
        })),
      });
      await writeAudit(
        {
          actor: { id: user.id, name: user.name, role: "OWNER" },
          action: "account.signup",
          entityType: "Account",
          entityId: account.id,
          metadata: {
            method: input.googleSub ? "google" : "email",
            trialEndsAt: account.trialEndsAt?.toISOString(),
            legal: currentVersions(),
          },
          meta,
          accountId: account.id,
        },
        tx,
      );
      return { accountId: account.id, userId: user.id };
    }),
  );
  await recordFunnelStep("EMAIL_VERIFIED", result.accountId, now);
  return result;
}
