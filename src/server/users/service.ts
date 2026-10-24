import type { User } from "@prisma/client";

import { isLocked } from "@/domain/auth/lockout";
import type { Role } from "@/domain/auth/roles";
import { createUserSchema, updateUserSchema } from "@/schemas/user";
import { diffFields, writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { hashPassword } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/auth/session";
import { temporaryPassword } from "@/server/auth/tokens";
import { db, type Tx } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { sendEmailChangedEmail } from "@/server/mail/account-mail";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { isUniqueViolation, isUuid } from "@/server/db-errors";

export type UserStatus = "active" | "locked" | "inactive" | "invited";

/** User fields safe to send to the browser. Never includes the password hash. */
export interface UserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  status: UserStatus;
  createdAt: Date;
}

function toView(u: User, now: Date): UserView {
  const status: UserStatus = !u.isActive
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
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    lockedUntil: isLocked(u, now) ? u.lockedUntil : null,
    status,
    createdAt: u.createdAt,
  };
}

export async function listUsers(actor: AuditActor, now = new Date()): Promise<UserView[]> {
  assertCan(actor, "user.manage");
  const users = await db.user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return users.map((u) => toView(u, now));
}

export async function getUser(actor: AuditActor, id: string, now = new Date()): Promise<UserView> {
  assertCan(actor, "user.manage");
  const user = await findUser(db, id);
  return toView(user, now);
}

async function findUser(client: Tx | typeof db, id: string): Promise<User> {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that user.");
  const user = await client.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("We couldn't find that user.");
  return user;
}

const emailTaken = () =>
  new ValidationError("Please check the highlighted fields.", {
    email: "Another user already has this email address.",
  });

/**
 * Create an account with a one-time temporary password. The Admin passes it to the person,
 * who must choose their own password at first sign-in.
 */
export async function createUser(
  actor: AuditActor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ user: UserView; temporaryPassword: string }> {
  assertCan(actor, "user.manage");
  const data = parseInput(createUserSchema, input);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...data,
          passwordHash,
          mustChangePassword: true,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(
        {
          actor,
          action: "user.create",
          entityType: "User",
          entityId: created.id,
          changes: { name: data.name, email: data.email, role: data.role },
          meta,
        },
        tx,
      );
      return created;
    });
    return { user: toView(user, now), temporaryPassword: password };
  } catch (err) {
    if (isUniqueViolation(err)) throw emailTaken();
    throw err;
  }
}

/** There must always be at least one active Admin. */
async function assertOtherActiveAdmin(tx: Tx, exceptUserId: string) {
  const others = await tx.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: exceptUserId } },
  });
  if (others === 0) {
    throw new ValidationError(
      "This is the only active Admin. Make someone else an Admin first, so nobody gets locked out.",
    );
  }
}

export async function updateUser(
  actor: AuditActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<UserView> {
  assertCan(actor, "user.manage");
  const data = parseInput(updateUserSchema, input);

  try {
    const { before, after } = await db.$transaction(async (tx) => {
      const before = await findUser(tx, id);

      if (data.role && data.role !== before.role) {
        if (before.id === actor.id) {
          throw new ValidationError("You can't change your own role. Ask another Admin.", {
            role: "You can't change your own role.",
          });
        }
        if (before.role === "ADMIN" && before.isActive) await assertOtherActiveAdmin(tx, before.id);
      }

      const changes = diffFields(before, data, ["name", "email", "role"]);
      if (Object.keys(changes).length === 0) return { before, after: before };

      const after = await tx.user.update({
        where: { id },
        data: { ...data, updatedById: actor.id },
      });
      await writeAudit(
        { actor, action: "user.update", entityType: "User", entityId: id, changes, meta },
        tx,
      );
      return { before, after };
    });

    // A role change takes effect at once: sign the user out so their next session
    // starts with the new permissions.
    if (after.role !== before.role) await revokeUserSessions(after.id, {}, now);
    if (after.email !== before.email) {
      await sendEmailChangedEmail(
        { name: after.name, oldEmail: before.email, newEmail: after.email },
        now,
      );
    }
    return toView(after, now);
  } catch (err) {
    if (isUniqueViolation(err)) throw emailTaken();
    throw err;
  }
}

/** Turn an account off (signing it out everywhere) or back on. Accounts are never deleted. */
export async function setUserActive(
  actor: AuditActor,
  id: string,
  active: boolean,
  meta: RequestMeta,
  now = new Date(),
): Promise<UserView> {
  assertCan(actor, "user.manage");
  const user = await db.$transaction(async (tx) => {
    const before = await findUser(tx, id);
    if (before.isActive === active) return before;
    if (!active) {
      if (before.id === actor.id) throw new ValidationError("You can't turn off your own account.");
      if (before.role === "ADMIN") await assertOtherActiveAdmin(tx, before.id);
    }
    const after = await tx.user.update({
      where: { id },
      data: { isActive: active, updatedById: actor.id },
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
  if (!active) await revokeUserSessions(id, {}, now);
  return toView(user, now);
}

export async function unlockUser(
  actor: AuditActor,
  id: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<UserView> {
  assertCan(actor, "user.manage");
  const user = await db.$transaction(async (tx) => {
    await findUser(tx, id);
    const after = await tx.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null, updatedById: actor.id },
    });
    await writeAudit({ actor, action: "user.unlock", entityType: "User", entityId: id, meta }, tx);
    return after;
  });
  return toView(user, now);
}
