import type { Invitation, Role } from "@prisma/client";
import { render } from "@react-email/render";

import type { GoogleProfile } from "@/domain/auth/google";
import { ROLE_LABELS, isAdminRole } from "@/domain/auth/roles";
import { SIGNUP_TWO_STEP_GRACE_DAYS } from "@/domain/auth/signup";
import { currentVersions } from "@/domain/legal/documents";
import { userLimitMessage, type PlanName } from "@/domain/plans/plans";
import { acceptInvitationSchema, inviteSchema } from "@/schemas/user";
import { writeAudit } from "@/server/audit";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { hashPassword } from "@/server/auth/password";
import { assertPolicy } from "@/server/auth/passwords";
import { createSession, revokeUserSessions } from "@/server/auth/session";
import { randomToken, sha256 } from "@/server/auth/tokens";
import { asSystem, db, type Tx } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { env } from "@/server/env";
import { ConflictError, NotFoundError, PlanLimitError, ValidationError } from "@/server/errors";
import { InvitationEmail } from "@/server/mail/templates/account-emails";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import { loadPlanAccess } from "@/server/plans/access";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

/** Invitations work for 7 days, once. */
export const INVITATION_DAYS = 7;

export interface TeamDeps {
  send: (mail: OutgoingMail, fromName: string) => Promise<void>;
}
const defaultDeps: TeamDeps = { send: deliver };

const inviteUrl = (token: string) => `${env().APP_URL.replace(/\/$/, "")}/invite/${token}`;

const pendingWhere = (accountId: string, now: Date) => ({
  accountId,
  acceptedAt: null,
  revokedAt: null,
  expiresAt: { gt: now },
});

/** Seats: active people plus open invitations (which hold a seat until used or expired). */
async function assertSeat(
  tx: Tx,
  accountId: string,
  plan: PlanName,
  limit: number,
  now: Date,
  options: { countInvitations: boolean; exceptInvitationId?: string },
) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`plan-users:${accountId}`}, 0))`;
  const members = await tx.membership.count({ where: { accountId, isActive: true } });
  const invites = options.countInvitations
    ? await tx.invitation.count({
        where: {
          ...pendingWhere(accountId, now),
          ...(options.exceptInvitationId ? { id: { not: options.exceptInvitationId } } : {}),
        },
      })
    : 0;
  if (members + invites + 1 > limit) throw new PlanLimitError(userLimitMessage(plan));
}

export interface TeamSeats {
  used: number;
  limit: number;
}

export interface InvitationView {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
}

/** "3 of 5 users" and the open invitations, for the Users page. */
export async function getTeam(
  actor: Actor,
  now = new Date(),
): Promise<{ seats: TeamSeats; invitations: InvitationView[] }> {
  assertCan(actor, "user.manage", { duringReadOnly: true });
  const [members, invitations] = await asSystem(() =>
    Promise.all([
      db.membership.count({ where: { accountId: actor.accountId, isActive: true } }),
      db.invitation.findMany({
        where: pendingWhere(actor.accountId, now),
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      }),
    ]),
  );
  return {
    seats: { used: members + invitations.length, limit: actor.access.users.limit },
    invitations,
  };
}

/**
 * Invite someone by email. The email says who invited them and links to /invite/<token>; the
 * link is also returned, so it can be shared another way if the email doesn't arrive.
 */
export async function inviteMember(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  deps: TeamDeps = defaultDeps,
): Promise<{ link: string; expiresAt: Date }> {
  assertCan(actor, "user.manage");
  const data = parseInput(inviteSchema, input);
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 86_400_000);
  const accountName = await asSystem(async () =>
    db.$transaction(async (tx) => {
      const existing = await tx.membership.findFirst({
        where: { accountId: actor.accountId, user: { email: data.email } },
        select: { isActive: true },
      });
      if (existing) {
        throw new ValidationError(
          existing.isActive
            ? "This person is already on your team."
            : "This person was on your team and is turned off. Turn them back on from the list instead.",
          { email: existing.isActive ? "Already on your team." : "Turn them back on instead." },
        );
      }
      // Inviting again replaces the earlier invitation (its link stops working).
      await tx.invitation.updateMany({
        where: { ...pendingWhere(actor.accountId, now), email: data.email },
        data: { revokedAt: now },
      });
      await assertSeat(tx, actor.accountId, actor.access.plan, actor.access.users.limit, now, {
        countInvitations: true,
      });
      const invite = await tx.invitation.create({
        data: {
          accountId: actor.accountId,
          email: data.email,
          role: data.role,
          tokenHash: sha256(token),
          invitedById: actor.id,
          createdAt: now,
          expiresAt,
        },
      });
      await writeAudit(
        {
          actor,
          action: "team.invite",
          entityType: "Invitation",
          entityId: invite.id,
          changes: { email: data.email, role: data.role },
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
      const account = await tx.account.findUniqueOrThrow({
        where: { id: actor.accountId },
        select: { name: true },
      });
      return account.name;
    }),
  );
  try {
    const element = (
      <InvitationEmail
        companyName={accountName}
        inviterName={actor.name}
        roleLabel={ROLE_LABELS[data.role]}
        url={inviteUrl(token)}
        validDays={INVITATION_DAYS}
      />
    );
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await deps.send(
      {
        to: [data.email],
        subject: `${actor.name} invited you to ${accountName} on Propfolio`,
        html,
        text,
      },
      "Propfolio",
    );
  } catch (err) {
    // The link is shown to the inviter too, so a failed email isn't a dead end.
    console.error("[team] invitation email not sent:", (err as Error).name);
  }
  return { link: inviteUrl(token), expiresAt };
}

export async function revokeInvitation(
  actor: Actor,
  id: string,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "user.manage", { duringReadOnly: true });
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that invitation.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id, ...pendingWhere(actor.accountId, now) },
        data: { revokedAt: now },
      });
      if (count === 0)
        throw new NotFoundError("That invitation was already used, withdrawn or expired.");
      await writeAudit(
        {
          actor,
          action: "team.invite_revoked",
          entityType: "Invitation",
          entityId: id,
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
    }),
  );
}

// ─── The invited person ─────────────────────────────────────────────────────────────────

export type InvitationState =
  | {
      ok: true;
      accountName: string;
      role: Role;
      email: string;
      inviterName: string | null;
      hasAccount: boolean;
    }
  | { ok: false; reason: "unknown" | "expired" | "used" };

async function findInvitation(token: string): Promise<Invitation | null> {
  if (!token || token.length > 200) return null;
  return asSystem(() => db.invitation.findUnique({ where: { tokenHash: sha256(token) } }));
}

export async function getInvitation(token: string, now = new Date()): Promise<InvitationState> {
  const inv = await findInvitation(token);
  if (!inv) return { ok: false, reason: "unknown" };
  if (inv.acceptedAt || inv.revokedAt) return { ok: false, reason: "used" };
  if (inv.expiresAt <= now) return { ok: false, reason: "expired" };
  const [account, inviter, user] = await asSystem(() =>
    Promise.all([
      db.account.findUniqueOrThrow({ where: { id: inv.accountId }, select: { name: true } }),
      inv.invitedById
        ? db.user.findUnique({ where: { id: inv.invitedById }, select: { name: true } })
        : null,
      db.user.findUnique({ where: { email: inv.email }, select: { id: true } }),
    ]),
  );
  return {
    ok: true,
    accountName: account.name,
    role: inv.role,
    email: inv.email,
    inviterName: inviter?.name ?? null,
    hasAccount: user !== null,
  };
}

const STALE = "This invitation has expired or was already used. Ask for a new one.";

/** Add the person to the team, mark the invitation used, and open a session in that account. */
type NewPerson = { name: string; passwordHash: string; googleSub: string | null };

async function join(
  inv: Invitation,
  who: { userId: string } | { newPerson: NewPerson },
  meta: RequestMeta,
  now: Date,
  how: string,
): Promise<{ token: string; expiresAt: Date }> {
  const access = await loadPlanAccess(inv.accountId, now);
  const userId = await asSystem(() =>
    db.$transaction(async (tx) => {
      // Someone new is created in the same transaction: never a sign-in without a team.
      const userId =
        "userId" in who ? who.userId : await createInvitedPerson(tx, inv, who.newPerson, meta, now);
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedUserId: userId },
      });
      if (claimed.count !== 1) throw new ConflictError(STALE);
      // The seat the invitation held: check again in case the plan changed since.
      await assertSeat(tx, inv.accountId, access.plan, access.users.limit, now, {
        countInvitations: false,
      });
      const existing = await tx.membership.findUnique({
        where: { accountId_userId: { accountId: inv.accountId, userId } },
      });
      if (existing?.isActive) throw new ConflictError("You're already on this team.");
      await tx.membership.upsert({
        where: { accountId_userId: { accountId: inv.accountId, userId } },
        create: {
          accountId: inv.accountId,
          userId,
          role: inv.role,
          createdById: inv.invitedById,
          lastUsedAt: now,
        },
        update: { role: inv.role, isActive: true, lastUsedAt: now },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true },
      });
      await writeAudit(
        {
          actor: { id: userId, name: user.name, role: inv.role },
          action: "team.joined",
          entityType: "User",
          entityId: userId,
          metadata: { invitationId: inv.id, role: inv.role, how },
          meta,
          accountId: inv.accountId,
        },
        tx,
      );
      return userId;
    }),
  );
  return createSession(userId, inv.accountId, meta, now);
}

/** Someone already signed in (with the invited email) joins the team. */
export async function acceptInvitationSignedIn(
  token: string,
  user: { id: string; email: string },
  meta: RequestMeta,
  now = new Date(),
) {
  const inv = await findInvitation(token);
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= now)
    throw new ConflictError(STALE);
  if (inv.email !== user.email.toLowerCase()) {
    throw new ValidationError(
      `This invitation is for ${inv.email}. Sign out, then open the link again and sign in with that email.`,
    );
  }
  return join(inv, { userId: user.id }, meta, now, "signed_in");
}

/**
 * Someone new: their name and password (the email is the invitation's: the link proves they
 * can read it, so no code is needed), and the legal checkbox.
 */
export async function acceptInvitationNewPerson(
  token: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  const data = parseInput(acceptInvitationSchema, input);
  const inv = await findInvitation(token);
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= now)
    throw new ConflictError(STALE);
  if (await asSystem(() => db.user.count({ where: { email: inv.email } }))) {
    throw new ValidationError(
      "This email already has a Propfolio account. Sign in to join instead.",
    );
  }
  await assertPolicy(data.password, inv.email).catch((err: unknown) => {
    if (err instanceof ValidationError) {
      throw new ValidationError(err.message, { password: Object.values(err.fieldErrors)[0]! });
    }
    throw err;
  });
  const newPerson = {
    name: data.name,
    passwordHash: await hashPassword(data.password),
    googleSub: null,
  };
  return join(inv, { newPerson }, meta, now, "new_password");
}

/** Someone new arriving from "Continue with Google" with the invited email. */
export async function acceptInvitationWithGoogle(
  token: string,
  profile: GoogleProfile,
  meta: RequestMeta,
  now = new Date(),
) {
  const inv = await findInvitation(token);
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= now)
    throw new ConflictError(STALE);
  if (inv.email !== profile.email) {
    throw new ValidationError(`This invitation is for ${inv.email}. Choose that Google account.`);
  }
  if (await asSystem(() => db.user.count({ where: { email: inv.email } }))) {
    throw new ValidationError(
      "This email already has a Propfolio account. Sign in to join instead.",
    );
  }
  const newPerson = {
    name: profile.name,
    passwordHash: await hashPassword(randomToken()),
    googleSub: profile.sub,
  };
  return join(inv, { newPerson }, meta, now, "google");
}

async function createInvitedPerson(
  tx: Tx,
  inv: Invitation,
  p: NewPerson,
  meta: RequestMeta,
  now: Date,
): Promise<string> {
  const user = await tx.user.create({
    data: {
      name: p.name,
      email: inv.email,
      passwordHash: p.passwordHash,
      googleSub: p.googleSub,
      mustChangePassword: false,
      passwordChangedAt: now,
      createdById: inv.invitedById,
      // Admins set up two-step sign-in too, with the same 14 days as a new Owner.
      twoStepGraceUntil: isAdminRole(inv.role)
        ? new Date(now.getTime() + SIGNUP_TWO_STEP_GRACE_DAYS * 86_400_000)
        : null,
      legalAcceptances: {
        create: currentVersions().map((v) => ({
          ...v,
          acceptedAt: now,
          ipAddress: meta.ipAddress,
        })),
      },
    },
  });
  return user.id;
}

// ─── Ownership ──────────────────────────────────────────────────────────────────────────

/**
 * The Owner hands the account (and the subscription) to an active Admin, and becomes an Admin.
 * One transaction: there is never a moment with no Owner or two.
 */
export async function transferOwnership(
  actor: Actor,
  userId: string,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "billing.manage", { duringReadOnly: true });
  if (actor.role !== "OWNER")
    throw new ValidationError("Only the Owner can hand over the account.");
  if (!isUuid(userId) || userId === actor.id) throw new NotFoundError("Choose another Admin.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const target = await tx.membership.findUnique({
        where: { accountId_userId: { accountId: actor.accountId, userId } },
        include: { user: { select: { name: true } } },
      });
      if (!target || !target.isActive || target.role !== "ADMIN") {
        throw new ValidationError(
          "Make them an Admin first: only an active Admin can become the Owner.",
        );
      }
      await tx.membership.update({
        where: { accountId_userId: { accountId: actor.accountId, userId: actor.id } },
        data: { role: "ADMIN", updatedById: actor.id },
      });
      await tx.membership.update({
        where: { accountId_userId: { accountId: actor.accountId, userId } },
        data: { role: "OWNER", updatedById: actor.id },
      });
      await writeAudit(
        {
          actor,
          action: "team.ownership_transferred",
          entityType: "Account",
          entityId: actor.accountId,
          changes: { owner: { before: actor.name, after: target.user.name } },
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
    }),
  );
  // Both people's open sessions carry their old role: start them again (except this one).
  await revokeUserSessions(userId, { accountId: actor.accountId }, now);
  await revokeUserSessions(
    actor.id,
    { accountId: actor.accountId, exceptSessionId: actor.sessionId },
    now,
  );
}
