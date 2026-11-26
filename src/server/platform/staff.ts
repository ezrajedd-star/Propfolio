import { staffChangeProblem, type PlatformRole } from "@/domain/platform/roles";
import { addStaffSchema, staffRoleSchema } from "@/schemas/platform";
import { asSystem, db, type Tx } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { issuePlatformSetupLink, type PlatformActor } from "./auth";
import { assertPlatformCan, writeStaffLog } from "./staff-log";

/**
 * Propfolio staff accounts, managed by a Platform Owner in the console. New people get a one-time
 * set-up link (password + authenticator); nobody is ever deleted, only turned off.
 */

export async function listStaff(actor: PlatformActor) {
  assertPlatformCan(actor, "staff.manage");
  return asSystem(() =>
    db.platformAdmin.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        totpConfirmedAt: true,
        setupTokenExpiresAt: true,
      },
    }),
  );
}

async function loadTarget(tx: Tx, id: string) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that person.");
  const target = await tx.platformAdmin.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("We couldn't find that person.");
  return target;
}

const activeOwners = (tx: Tx) =>
  tx.platformAdmin.count({ where: { role: "PLATFORM_OWNER", isActive: true } });

/** Add a staff member. Returns their one-time set-up link (shown once, valid 24 hours). */
export async function addStaff(
  actor: PlatformActor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<string> {
  assertPlatformCan(actor, "staff.manage");
  const data = parseInput(addStaffSchema, input);
  const exists = await asSystem(() =>
    db.platformAdmin.findUnique({ where: { email: data.email }, select: { id: true } }),
  );
  if (exists) {
    throw new ValidationError("Someone with this email is already on the staff list.", {
      email: "Already on the staff list.",
    });
  }
  const link = await issuePlatformSetupLink(
    { email: data.email, name: data.name, role: data.role },
    now,
  );
  await asSystem(async () => {
    const added = await db.platformAdmin.findUniqueOrThrow({ where: { email: data.email } });
    await writeStaffLog({
      actor,
      kind: "SETTING",
      action: "staff.added",
      entityType: "PlatformAdmin",
      entityId: added.id,
      metadata: { role: data.role },
      meta,
    });
  });
  return link;
}

export async function changeStaffRole(
  actor: PlatformActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertPlatformCan(actor, "staff.manage");
  const { role } = parseInput(staffRoleSchema, input);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const target = await loadTarget(tx, id);
      if (target.role === role) return;
      const problem = staffChangeProblem({
        actorId: actor.id,
        targetId: target.id,
        targetRole: target.role,
        targetActive: target.isActive,
        next: { role },
        activeOwners: await activeOwners(tx),
      });
      if (problem) throw new ValidationError(problem);
      await tx.platformAdmin.update({ where: { id }, data: { role } });
      await writeStaffLog(
        {
          actor,
          kind: "SETTING",
          action: "staff.role_changed",
          entityType: "PlatformAdmin",
          entityId: id,
          metadata: { before: target.role, after: role satisfies PlatformRole },
          meta,
        },
        tx,
      );
    }),
  );
}

/** Turn someone off (their sessions end at once) or back on. */
export async function setStaffActive(
  actor: PlatformActor,
  id: string,
  isActive: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(actor, "staff.manage");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const target = await loadTarget(tx, id);
      if (target.isActive === isActive) return;
      const problem = staffChangeProblem({
        actorId: actor.id,
        targetId: target.id,
        targetRole: target.role,
        targetActive: target.isActive,
        next: { isActive },
        activeOwners: await activeOwners(tx),
      });
      if (problem) throw new ValidationError(problem);
      await tx.platformAdmin.update({ where: { id }, data: { isActive } });
      if (!isActive) {
        await tx.platformSession.updateMany({
          where: { adminId: id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await writeStaffLog(
        {
          actor,
          kind: "SETTING",
          action: isActive ? "staff.reactivated" : "staff.deactivated",
          entityType: "PlatformAdmin",
          entityId: id,
          meta,
        },
        tx,
      );
    }),
  );
}

/**
 * Someone lost their phone: clear their password and authenticator, sign them out, and return a
 * new one-time set-up link. Not for yourself.
 */
export async function resetStaffSignIn(
  actor: PlatformActor,
  id: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<string> {
  assertPlatformCan(actor, "staff.manage");
  if (id === actor.id) {
    throw new ValidationError("Ask another Platform Owner to reset your own sign-in.");
  }
  const target = await asSystem(() => db.$transaction((tx) => loadTarget(tx, id)));
  if (!target.isActive) throw new ValidationError("Turn this person back on first.");
  const link = await issuePlatformSetupLink({ email: target.email }, now);
  await asSystem(() =>
    writeStaffLog({
      actor,
      kind: "SETTING",
      action: "staff.sign_in_reset",
      entityType: "PlatformAdmin",
      entityId: id,
      meta,
    }),
  );
  return link;
}
