import type { ApprovalStatus, Prisma } from "@prisma/client";

import {
  APPROVALS,
  AGENTS,
  ACTION_TYPE_LABELS,
  type ActionType,
  type AgentKey,
} from "@/config/agents";
import { asSystem, db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import { reportError } from "@/server/monitoring/report-error";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import type { RequestMeta } from "@/server/request-meta";
import { EDITABLE_FIELD, executorFor } from "./executors";
import { emailOwners } from "./notify";

/**
 * The approval inbox: what agents want to do and are waiting for a person, plus "Act and tell"
 * items shown for information. Approve, edit then approve, or reject with a reason (saved).
 */

export interface NewApproval {
  agentKey: AgentKey;
  actionType: ActionType;
  title: string;
  preview: string;
  payload: Record<string, unknown>;
  lockedBecause?: string | null;
  entityType?: string;
  entityId?: string;
}

export async function submitApproval(a: NewApproval, now = new Date()) {
  return asSystem(() =>
    db.approval.create({
      data: {
        agentKey: a.agentKey,
        actionType: a.actionType,
        title: a.title.slice(0, 200),
        preview: a.preview.slice(0, 20_000),
        payload: a.payload as Prisma.InputJsonValue,
        lockedBecause: a.lockedBecause ?? null,
        entityType: a.entityType ?? null,
        entityId: a.entityId ?? null,
        createdAt: now,
      },
    }),
  );
}

/** Carry out an item at once ("Act and tell" or "Act"), recording it for the inbox and log. */
export async function actNow(a: NewApproval, tell: boolean, now = new Date()): Promise<string> {
  const exec = executorFor(a.actionType);
  if (!exec) throw new Error(`Nothing can carry out ${a.actionType}.`);
  const result = await exec(a.payload, { approvedByName: null, now });
  if (tell) {
    await asSystem(() =>
      db.approval.create({
        data: {
          agentKey: a.agentKey,
          actionType: a.actionType,
          title: a.title.slice(0, 200),
          preview: a.preview.slice(0, 20_000),
          payload: a.payload as Prisma.InputJsonValue,
          status: "TOLD",
          entityType: a.entityType ?? null,
          entityId: a.entityId ?? null,
          executedAt: now,
          createdAt: now,
        },
      }),
    );
  }
  return result;
}

export async function listApprovals(
  admin: PlatformActor,
  filter: { status?: ApprovalStatus | "WAITING" } = { status: "WAITING" },
) {
  assertPlatformCan(admin, "approvals.view");
  return asSystem(() =>
    db.approval.findMany({
      where:
        filter.status === "WAITING" || !filter.status
          ? { status: "PENDING" }
          : { status: filter.status },
      orderBy: { createdAt: filter.status === "WAITING" || !filter.status ? "asc" : "desc" },
      take: 200,
    }),
  );
}

export async function getApproval(admin: PlatformActor, id: string) {
  assertPlatformCan(admin, "approvals.view");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that item.");
  const a = await asSystem(() => db.approval.findUnique({ where: { id } }));
  if (!a) throw new NotFoundError("We couldn't find that item.");
  return {
    ...a,
    agentName: AGENTS[a.agentKey as AgentKey]?.name ?? a.agentKey,
    actionLabel: ACTION_TYPE_LABELS[a.actionType as ActionType] ?? a.actionType,
    editable: Boolean(EDITABLE_FIELD[a.actionType as ActionType]),
    carriedOut: Boolean(executorFor(a.actionType)),
  };
}

export async function countWaitingApprovals(): Promise<number> {
  return asSystem(() => db.approval.count({ where: { status: "PENDING" } }));
}

async function claimPending(id: string) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that item.");
  const a = await db.approval.findUnique({ where: { id } });
  if (!a) throw new NotFoundError("We couldn't find that item.");
  if (a.status !== "PENDING") throw new ValidationError("Someone has already decided this one.");
  return a;
}

/**
 * Approve, optionally with edited text. The item is carried out at once; if that fails it is
 * marked Failed with the reason, and nothing is retried automatically.
 */
export async function approve(
  admin: PlatformActor,
  id: string,
  input: { editedText?: string | null; note?: string | null },
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "approvals.decide");
  const edited = input.editedText?.trim() || null;
  const { approval, payload } = await asSystem(() =>
    db.$transaction(async (tx) => {
      const a = await claimPending(id);
      const field = EDITABLE_FIELD[a.actionType as ActionType];
      if (edited && !field) throw new ValidationError("This item can't be edited.");
      const payload = { ...(a.payload as Record<string, unknown>) };
      const changed = Boolean(edited && field && payload[field] !== edited);
      if (changed && field) payload[field] = edited;
      const { count } = await tx.approval.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "APPROVED",
          decidedById: admin.id,
          decidedByName: admin.name,
          decidedAt: now,
          reason: input.note?.trim() || null,
          ...(changed ? { editedPreview: edited, payload: payload as Prisma.InputJsonValue } : {}),
        },
      });
      if (count !== 1) throw new ValidationError("Someone has already decided this one.");
      await writeStaffLog(
        {
          actor: admin,
          kind: "CHANGE",
          action: changed ? "approval.edited_and_approved" : "approval.approved",
          entityType: "Approval",
          entityId: id,
          metadata: { agent: a.agentKey, actionType: a.actionType },
          meta,
        },
        tx,
      );
      return { approval: a, payload };
    }),
  );
  const exec = executorFor(approval.actionType);
  if (!exec) return { result: "Approved. Send or post it yourself." };
  try {
    const result = await exec(payload, { approvedByName: admin.name, now });
    await asSystem(() => db.approval.update({ where: { id }, data: { executedAt: now } }));
    return { result };
  } catch (err) {
    reportError(err, `approval:${approval.actionType}`);
    const message =
      err instanceof Error ? err.message.slice(0, 300) : "It couldn't be carried out.";
    await asSystem(() =>
      db.approval.update({ where: { id }, data: { status: "FAILED", executionError: message } }),
    );
    throw new ValidationError(`Approved, but it couldn't be carried out: ${message}`);
  }
}

export async function reject(
  admin: PlatformActor,
  id: string,
  reason: string,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "approvals.decide");
  const why = reason.trim();
  if (!why)
    throw new ValidationError("Say why, so the agent can learn from it.", { reason: "Say why." });
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const a = await claimPending(id);
      const { count } = await tx.approval.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "REJECTED",
          decidedById: admin.id,
          decidedByName: admin.name,
          decidedAt: now,
          reason: why.slice(0, 1000),
        },
      });
      if (count !== 1) throw new ValidationError("Someone has already decided this one.");
      await writeStaffLog(
        {
          actor: admin,
          kind: "CHANGE",
          action: "approval.rejected",
          entityType: "Approval",
          entityId: id,
          metadata: { agent: a.agentKey, actionType: a.actionType },
          meta,
        },
        tx,
      );
    }),
  );
}

/** Daily: tell the Platform Owners about items waiting longer than the configured hours. */
export async function remindWaitingApprovals(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - APPROVALS.remindAfterHours * 3_600_000);
  const waiting = await asSystem(() =>
    db.approval.findMany({
      where: { status: "PENDING", createdAt: { lt: before } },
      select: { title: true, agentKey: true },
      orderBy: { createdAt: "asc" },
    }),
  );
  if (waiting.length === 0) return 0;
  const lines = waiting
    .slice(0, 20)
    .map((w) => `• ${AGENTS[w.agentKey as AgentKey]?.name ?? w.agentKey}: ${w.title}`)
    .join("\n");
  await emailOwners(
    `${waiting.length} approval${waiting.length === 1 ? "" : "s"} waiting`,
    `These have waited more than ${APPROVALS.remindAfterHours} hours:\n\n${lines}`,
    "/platform/approvals",
  );
  return waiting.length;
}
