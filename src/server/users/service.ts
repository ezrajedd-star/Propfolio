import type { Membership, User } from "@prisma/client";

import { isLocked } from "@/domain/auth/lockout";
import { isAdminRole, type Role } from "@/domain/auth/roles";
import { createUserSchema, updateUserSchema } from "@/schemas/user";
import { diffFields, writeAudit } from "@/server/audit";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { assertUserRoom } from "@/server/plans/access";
import { hashPassword } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/auth/session";
import { temporaryPassword } from "@/server/auth/tokens";
import { asSystem, db, type Tx } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { sendEmailChangedEmail } from "@/server/mail/account-mail";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { isUniqueViolation, isUuid } from "@/server/db-errors";

export type UserStatus = "active" | "locked" | "inactive" | "invited";

/**
 * A person as seen from the current account. Never includes the password hash. `role` and
 * `isActive` are about this account only.
 */
export interface UserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  /** Two-step sign-in is set up. */
  twoStepOn: boolean;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  status: UserStatus;
  createdAt: Date;
}

type MemberWithUser = Membership & { user: User };

function toView(m: MemberWithUser, now: Date): UserView {
  const u = m.user;
  const status: UserStatus = !m.isActive
    ? "inactive"
    : isLocked(u, now)
      ? "locked"
      : u.mustChangePassword && !u.lastLoginAt
        ? "invited"
        : "active";
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: m.role,
    isActive: m.isActive,
    mustChangePassword: u.mustChangePassword,
    twoStepOn: u.totpConfirmedAt !== null,
    lastLoginAt: u.lastLoginAt,
    lockedUntil: isLocked(u, now) ? u.lockedUntil : null,
    status,
    createdAt: m.createdAt,
  };
}

/** People in the current account (only memberships of this account are visible). */
export async function listUsers(actor: Actor, now = new Date()): Promise<UserView[]> {
  assertCan(actor, "user.manage", { duringReadOnly: true }); // viewing is fine while read-only
  const members = await db.membership.findMany({
    include: { user: true },
    orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
  });
  return members.map((m) => toView(m, now));
}

export async function getUser(actor: Actor, id: string, now = new Date()): Promise<UserView> {
  assertCan(actor, "user.manage", { duringReadOnly: true }); // viewing is fine while read-only
  return toView(await findMember(db, id), now);
}

async function findMember(client: Tx | typeof db, userId: string): Promise<MemberWithUser> {
  if (!isUuid(userId)) throw new NotFoundError("We couldn't find that user.");
  const member = await client.membership.findFirst({ where: { userId }, include: { user: true } });
  if (!member) throw new NotFoundError("We couldn't find that user.");
  return member;
}

const emailTaken = () =>
  new ValidationError("Please check the highlighted fields.", {
    email: "Another user already has this email address.",
  });

/**
 * Add a person to the current account with a one-time temporary password. The Admin passes it
 * to the person, who must choose their own password at first sign-in.
 *
 * The sign-in record is created outside the account's data (it isn't anyone's to see yet),
 * together with the membership and the audit entry, in one transaction.
 */
export async function createUser(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ user: UserView; temporaryPassword: string }> {
  assertCan(actor, "user.manage");
  const data = parseInput(createUserSchema, input);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const { accountId } = actor;

  try {
    const member = await asSystem(() =>
      db.$transaction(async (tx) => {
        await assertUserRoom(tx, actor);
        const user = await tx.user.create({
          data: {
            name: data.name,
            email: data.email,
            passwordHash,
            mustChangePassword: true,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
        const membership = await tx.membership.create({
          data: {
            accountId,
            userId: user.id,
            role: data.role,
            createdById: actor.id,
            updatedById: actor.id,
          },
          include: { user: true },
        });
        await writeAudit(
          {
            actor,
            action: "user.create",
            entityType: "User",
            entityId: user.id,
            changes: { name: data.name, email: data.email, role: data.role },
            meta,
            accountId,
          },
          tx,
        );
        return membership;
      }),
    );
    return { user: toView(member, now), temporaryPassword: password };
  } catch (err) {
    if (isUniqueViolation(err)) throw emailTaken();
    throw err;
  }
}

/** There must always be at least one other active Owner or Admin. */
async function assertOtherActiveAdmin(tx: Tx, exceptUserId: string) {
  const others = await tx.membership.count({
    where: { role: { in: ["OWNER", "ADMIN"] }, isActive: true, userId: { not: exceptUserId } },
  });
  if (others === 0) {
    throw new ValidationError(
      "This is the only active Admin. Make someone else an Admin first, so nobody gets locked out.",
    );
  }
}

/** Does this person also belong to another account? Then only they can change their details. */
async function belongsElsewhere(userId: string, accountId: string): Promise<boolean> {
  const n = await asSystem(() =>
    db.membership.count({ where: { userId, accountId: { not: accountId } } }),
  );
  return n > 0;
}

export async function updateUser(
  actor: Actor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<UserView> {
  assertCan(actor, "user.manage");
  const data = parseInput(updateUserSchema, input);

  try {
    const { before, after } = await db.$transaction(async (tx) => {
      const before = await findMember(tx, id);

      if (data.role && data.role !== before.role) {
        if (before.role === "OWNER") {
          throw new ValidationError("The Owner's role can't be changed.", {
            role: "The Owner's role can't be changed.",
          });
        }
        if (before.userId === actor.id) {
          throw new ValidationError("You can't change your own role. Ask another Admin.", {
            role: "You can't change your own role.",
          });
        }
        if (isAdminRole(before.role) && before.isActive) {
          await assertOtherActiveAdmin(tx, before.userId);
        }
      }

      const userChanges = diffFields(before.user, data, ["name", "email"]);
      const roleChanges = diffFields(before, data, ["role"]);
      if (Object.keys(userChanges).length > 0 && (await belongsElsewhere(id, actor.accountId))) {
        throw new ValidationError(
          "This person also uses Propfolio with another company, so only they can change their name or email.",
        );
      }
      const changes = { ...userChanges, ...roleChanges };
      if (Object.keys(changes).length === 0) return { before, after: before };

      const user =
        Object.keys(userChanges).length > 0
          ? await tx.user.update({
              where: { id },
              data: { name: data.name, email: data.email, updatedById: actor.id },
            })
          : before.user;
      const membership =
        Object.keys(roleChanges).length > 0
          ? await tx.membership.update({
              where: { id: before.id },
              data: { role: data.role, updatedById: actor.id },
            })
          : before;
      await writeAudit(
        { actor, action: "user.update", entityType: "User", entityId: id, changes, meta },
        tx,
      );
      return { before, after: { ...membership, user } };
    });

    // A role change takes effect at once: sign the person out of this account so their next
    // session starts with the new permissions.
    if (after.role !== before.role) {
      await revokeUserSessions(id, { accountId: actor.accountId }, now);
    }
    if (after.user.email !== before.user.email) {
      await sendEmailChangedEmail(
        { name: after.user.name, oldEmail: before.user.email, newEmail: after.user.email },
        now,
      );
    }
    return toView(after, now);
  } catch (err) {
    if (isUniqueViolation(err)) throw emailTaken();
    throw err;
  }
}

/**
 * Turn someone off in this account (signing them out of it) or back on. Nobody is deleted, and
 * their access to other accounts is not affected.
 */
export async function setUserActive(
  actor: Actor,
  id: string,
  active: boolean,
  meta: RequestMeta,
  now = new Date(),
): Promise<UserView> {
  assertCan(actor, "user.manage");
  const member = await db.$transaction(async (tx) => {
    const before = await findMember(tx, id);
    if (before.isActive === active) return before;
    if (active) await assertUserRoom(tx, actor);
    if (!active) {
      if (before.userId === actor.id) {
        throw new ValidationError("You can't turn off your own account.");
      }
      if (before.role === "OWNER") throw new ValidationError("The Owner can't be turned off.");
      if (isAdminRole(before.role)) await assertOtherActiveAdmin(tx, before.userId);
    }
    const after = await tx.membership.update({
      where: { id: before.id },
      data: { isActive: active, updatedById: actor.id },
      include: { user: true },
    });
    await writeAudit(
      {
        actor,
        action: active ? "user.activate" : "user.deactivate",
        entityType: "User",
        entityId: id,
        changes: { isActive: { before: before.isActive, after: active } },
        meta,
      },
      tx,
    );
    return after;
  });
  if (!active) await revokeUserSessions(id, { accountId: actor.accountId }, now);
  return toView(member, now);
}

export async function unlockUser(
  actor: Actor,
  id: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<UserView> {
  assertCan(actor, "user.manage");
  const member = await db.$transaction(async (tx) => {
    const before = await findMember(tx, id);
    const user = await tx.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null, updatedById: actor.id },
    });
    await writeAudit({ actor, action: "user.unlock", entityType: "User", entityId: id, meta }, tx);
    return { ...before, user };
  });
  return toView(member, now);
}
