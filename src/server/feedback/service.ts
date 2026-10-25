import { z } from "zod";

import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

const feedbackSchema = z.object({
  message: z
    .string()
    .trim()
    .min(5, "Please describe what happened in a few words.")
    .max(4000, "Please keep it under 4,000 characters."),
  /** Only the path is kept: query strings can contain search words or ids. */
  pagePath: z
    .string()
    .max(500)
    .transform((p) => (p.startsWith("/") ? p.split(/[?#]/)[0]!.slice(0, 200) : "/")),
});

/** Anyone signed in can send feedback during the test (UAT). */
export async function sendFeedback(actor: AuditActor, input: unknown, meta: RequestMeta) {
  const data = parseInput(feedbackSchema, input);
  return db.$transaction(async (tx) => {
    const f = await tx.feedback.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        role: actor.role,
        pagePath: data.pagePath,
        message: data.message,
      },
    });
    await writeAudit(
      { actor, action: "feedback.send", entityType: "Feedback", entityId: f.id, meta },
      tx,
    );
    return f;
  });
}

export async function listFeedback(actor: AuditActor, opts: { includeDone?: boolean } = {}) {
  assertCan(actor, "settings.manage");
  return db.feedback.findMany({
    where: opts.includeDone ? {} : { status: "NEW" },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function setFeedbackDone(
  actor: AuditActor,
  id: string,
  done: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "settings.manage");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that note.");
  const f = await db.feedback.findUnique({ where: { id } });
  if (!f) throw new NotFoundError("We couldn't find that note.");
  await db.$transaction(async (tx) => {
    await tx.feedback.update({
      where: { id },
      data: done
        ? { status: "DONE", doneAt: now, doneById: actor.id }
        : { status: "NEW", doneAt: null, doneById: null },
    });
    await writeAudit(
      {
        actor,
        action: "feedback.done",
        entityType: "Feedback",
        entityId: id,
        metadata: { done },
        meta,
      },
      tx,
    );
  });
}
