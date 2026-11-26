import type { LeadStage, Prisma } from "@prisma/client";

import { PIPELINE } from "@/config/ops";
import {
  LEAD_STAGE_LABELS,
  PIPELINE_EVENT_LABELS,
  autoStage,
  lostLeadExpired,
  parseImportRow,
  type ImportRow,
  type PipelineEvent,
} from "@/domain/pipeline/pipeline";
import { toDbDate, fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import {
  activitySchema,
  deleteLeadSchema,
  discoverySchema,
  leadSchema,
  moveStageSchema,
} from "@/schemas/pipeline";
import { brevoClient, type BrevoClient } from "@/server/brevo/client";
import { asSystem, db, type Tx } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import { reportError } from "@/server/monitoring/report-error";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

/**
 * The sales pipeline: Propfolio's own leads (platform staff only). Leads move by hand and
 * automatically (sign-up, trial, first lease, first payment, cancellation). Only leads who
 * agreed to marketing are sent to Brevo's marketing list; unsubscribes come back.
 */

type Who = { id: string; name: string } | null;

async function activity(
  tx: Tx,
  leadId: string,
  who: Who,
  kind: Prisma.LeadActivityCreateInput["kind"],
  text: string,
  now: Date,
) {
  await tx.leadActivity.create({
    data: {
      leadId,
      kind,
      text,
      actorId: who?.id ?? null,
      actorName: who?.name ?? "Propfolio",
      createdAt: now,
    },
  });
  await tx.lead.update({ where: { id: leadId }, data: { lastActivityAt: now } });
}

function staffLog(
  tx: Tx,
  admin: PlatformActor,
  action: string,
  leadId: string,
  meta: RequestMeta | null,
  metadata?: Record<string, unknown>,
) {
  return writeStaffLog(
    { actor: admin, kind: "CHANGE", action, entityType: "Lead", entityId: leadId, metadata, meta },
    tx,
  );
}

async function loadLead(tx: Tx, id: string) {
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that lead.");
  const lead = await tx.lead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError("We couldn't find that lead.");
  return lead;
}

// ─── Lists ───────────────────────────────────────────────────────────────────────────────

export interface LeadFilters {
  q?: string;
  stage?: LeadStage;
  source?: Prisma.LeadWhereInput["source"];
  ownerId?: string;
  /** "Follow up today": a follow-up date today or earlier, still in play. */
  followUpToday?: boolean;
}

export async function listLeads(admin: PlatformActor, filters: LeadFilters = {}, now = new Date()) {
  assertPlatformCan(admin, "pipeline.view");
  const q = filters.q?.trim();
  return asSystem(() =>
    db.lead.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
                { email: { contains: q.toLowerCase() } },
              ],
            }
          : {}),
        ...(filters.stage ? { stage: filters.stage } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
        ...(filters.followUpToday
          ? {
              nextFollowUp: { lte: toDbDate(manilaToday(now) as IsoDate) },
              stage: { notIn: ["LOST", "PAYING"] },
            }
          : {}),
      },
      orderBy: filters.followUpToday ? [{ nextFollowUp: "asc" }] : [{ lastActivityAt: "desc" }],
      take: 500,
    }),
  );
}

export async function getLead(admin: PlatformActor, id: string, meta: RequestMeta | null = null) {
  assertPlatformCan(admin, "pipeline.view");
  return asSystem(async () => {
    const lead = await db.$transaction((tx) => loadLead(tx, id));
    const [activities, account] = await Promise.all([
      db.leadActivity.findMany({
        where: { leadId: id },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      lead.accountId
        ? db.account.findUnique({ where: { id: lead.accountId }, select: { id: true, name: true } })
        : null,
    ]);
    await writeStaffLog({
      actor: admin,
      kind: "VIEW",
      action: "lead.viewed",
      entityType: "Lead",
      entityId: id,
      meta,
    });
    return {
      ...lead,
      nextFollowUp: lead.nextFollowUp ? fromDbDate(lead.nextFollowUp) : null,
      activities,
      account,
    };
  });
}

// ─── Changes by staff ────────────────────────────────────────────────────────────────────

function leadData(
  data: ReturnType<typeof leadSchema.parse>,
  now: Date,
  before?: { marketingConsent: boolean; consentAt: Date | null },
) {
  const consentChanged = !before || before.marketingConsent !== data.marketingConsent;
  return {
    name: data.name,
    company: data.company,
    type: data.type,
    email: data.email ? data.email.toLowerCase() : null,
    phone: data.phone || null,
    source: data.source,
    portfolioSize: data.portfolioSize === "" ? null : data.portfolioSize,
    notes: data.notes,
    nextFollowUp: data.nextFollowUp ? toDbDate(data.nextFollowUp as IsoDate) : null,
    ownerId: data.ownerId || null,
    marketingConsent: data.marketingConsent,
    ...(consentChanged
      ? data.marketingConsent
        ? { consentAt: now, consentSource: data.consentSource, unsubscribedAt: null }
        : { consentAt: null, consentSource: null }
      : {}),
  };
}

async function emailTaken(email: string | null, exceptId?: string) {
  if (!email) return;
  const other = await db.lead.findUnique({ where: { email } });
  if (other && other.id !== exceptId) {
    throw new ValidationError("A lead with this email is already in the pipeline.", {
      email: "Already in the pipeline.",
    });
  }
}

export async function createLead(
  admin: PlatformActor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  brevo: BrevoClient = brevoClient(),
) {
  assertPlatformCan(admin, "pipeline.manage");
  const data = parseInput(leadSchema, input);
  const lead = await asSystem(async () => {
    await emailTaken(data.email.toLowerCase() || null);
    return db.$transaction(async (tx) => {
      const l = await tx.lead.create({
        data: { ...leadData(data, now), createdAt: now, stageChangedAt: now },
      });
      await activity(tx, l.id, admin, "CREATED", "Added by hand", now);
      await staffLog(tx, admin, "lead.created", l.id, meta, { source: l.source });
      return l;
    });
  });
  await syncLead(lead.id, now, brevo);
  return lead;
}

export async function updateLead(
  admin: PlatformActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  brevo: BrevoClient = brevoClient(),
) {
  assertPlatformCan(admin, "pipeline.manage");
  const data = parseInput(leadSchema, input);
  await asSystem(async () => {
    await emailTaken(data.email.toLowerCase() || null, id);
    await db.$transaction(async (tx) => {
      const before = await loadLead(tx, id);
      const next = leadData(data, now, before);
      await tx.lead.update({ where: { id }, data: next });
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
        (k) => JSON.stringify(next[k]) !== JSON.stringify(before[k as keyof typeof before]),
      );
      if (before.marketingConsent !== data.marketingConsent) {
        await activity(
          tx,
          id,
          admin,
          "CONSENT",
          data.marketingConsent
            ? `Agreed to marketing (${data.consentSource})`
            : "Marketing consent withdrawn",
          now,
        );
      }
      if (changed.length)
        await activity(tx, id, admin, "UPDATED", `Changed: ${changed.join(", ")}`, now);
      await staffLog(tx, admin, "lead.updated", id, meta, { fields: changed });
    });
  });
  await syncLead(id, now, brevo);
}

export async function moveLeadStage(
  admin: PlatformActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "pipeline.manage");
  const { stage, lostReason } = parseInput(moveStageSchema, input);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const before = await loadLead(tx, id);
      if (before.stage === stage) return;
      await tx.lead.update({
        where: { id },
        data: {
          stage,
          stageChangedAt: now,
          ...(stage === "LOST" ? { lostReason, lostAt: now } : { lostReason: null, lostAt: null }),
        },
      });
      await activity(
        tx,
        id,
        admin,
        "STAGE_CHANGED",
        `${LEAD_STAGE_LABELS[before.stage]} → ${LEAD_STAGE_LABELS[stage]}${stage === "LOST" ? ` (${lostReason})` : ""}`,
        now,
      );
      await staffLog(tx, admin, "lead.stage_changed", id, meta, { from: before.stage, to: stage });
    }),
  );
}

export async function addLeadActivity(
  admin: PlatformActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "pipeline.manage");
  const { kind, text } = parseInput(activitySchema, input);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      await loadLead(tx, id);
      await activity(tx, id, admin, kind, text, now);
      await staffLog(tx, admin, "lead.activity_added", id, meta, { kind });
    }),
  );
}

export async function saveDiscoveryNotes(
  admin: PlatformActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "pipeline.manage");
  const notes = parseInput(discoverySchema, input);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      await loadLead(tx, id);
      await tx.lead.update({ where: { id }, data: { discovery: notes as Prisma.InputJsonValue } });
      await activity(tx, id, admin, "NOTE", "Discovery notes saved", now);
      await staffLog(tx, admin, "lead.discovery_saved", id, meta);
    }),
  );
}

/**
 * Import leads from a spreadsheet. Every row is checked first; if any row has a problem nothing
 * is imported and the problems are listed. Leads already in the pipeline (same email) are skipped.
 */
export async function importLeads(
  admin: PlatformActor,
  rows: Partial<ImportRow>[],
  meta: RequestMeta,
  now = new Date(),
  brevo: BrevoClient = brevoClient(),
) {
  assertPlatformCan(admin, "pipeline.manage");
  if (rows.length === 0) throw new ValidationError("The spreadsheet has no rows to import.");
  if (rows.length > 2000) throw new ValidationError("Import up to 2,000 leads at a time.");
  const parsed = rows.map((r) => parseImportRow(r));
  const errors = parsed
    .map((p, i) => ("error" in p ? { row: i + 2, error: p.error } : null))
    .filter((e): e is { row: number; error: string } => e !== null);
  if (errors.length) return { created: 0, skipped: 0, errors };
  const leads = parsed.map((p) => ("lead" in p ? p.lead : null)!);
  const ids = await asSystem(() =>
    db.$transaction(
      async (tx) => {
        const emails = leads.map((l) => l.email).filter((e): e is string => !!e);
        const existing = new Set(
          (
            await tx.lead.findMany({ where: { email: { in: emails } }, select: { email: true } })
          ).map((l) => l.email),
        );
        const seen = new Set<string>();
        const created: string[] = [];
        let skipped = 0;
        for (const l of leads) {
          if (l.email && (existing.has(l.email) || seen.has(l.email))) {
            skipped += 1;
            continue;
          }
          if (l.email) seen.add(l.email);
          const lead = await tx.lead.create({
            data: {
              name: l.name,
              company: l.company,
              type: l.type,
              email: l.email,
              phone: l.phone,
              source: l.source,
              stage: l.stage,
              ...(l.stage === "LOST" ? { lostAt: now, lostReason: "Imported as lost" } : {}),
              portfolioSize: l.portfolioSize,
              notes: l.notes,
              nextFollowUp: l.nextFollowUp ? toDbDate(l.nextFollowUp as IsoDate) : null,
              marketingConsent: l.marketingConsent,
              consentAt: l.consentDate ? new Date(`${l.consentDate}T00:00:00+08:00`) : null,
              consentSource: l.consentSource,
              createdAt: now,
              stageChangedAt: now,
            },
          });
          await activity(tx, lead.id, admin, "CREATED", "Imported from a spreadsheet", now);
          created.push(lead.id);
        }
        await writeStaffLog(
          {
            actor: admin,
            kind: "CHANGE",
            action: "lead.imported",
            entityType: "Lead",
            metadata: { created: created.length, skipped },
            meta,
          },
          tx,
        );
        return { created, skipped };
      },
      { timeout: 60_000 },
    ),
  );
  for (const id of ids.created) await syncLead(id, now, brevo);
  return {
    created: ids.created.length,
    skipped: ids.skipped,
    errors: [] as { row: number; error: string }[],
  };
}

/** A privacy deletion request: the lead and its timeline are deleted here and in Brevo. */
export async function deleteLeadForPrivacy(
  admin: PlatformActor,
  id: string,
  input: unknown,
  meta: RequestMeta,
  brevo: BrevoClient = brevoClient(),
) {
  assertPlatformCan(admin, "pipeline.manage");
  const { reason } = parseInput(deleteLeadSchema, input);
  const email = await asSystem(() =>
    db.$transaction(async (tx) => {
      const lead = await loadLead(tx, id);
      await tx.lead.delete({ where: { id } });
      // Only the reason stays: no name or email in the log.
      await writeStaffLog(
        {
          actor: admin,
          kind: "CHANGE",
          action: "lead.deleted_privacy",
          entityType: "Lead",
          entityId: id,
          metadata: { reason },
          meta,
        },
        tx,
      );
      return lead.email;
    }),
  );
  if (email)
    await brevo.deleteContact(email).catch((err: unknown) => reportError(err, "brevo-delete"));
}

// ─── Automatic changes ───────────────────────────────────────────────────────────────────

/**
 * Something happened to a customer account: move its lead. On sign-up, a lead is linked (by the
 * Owner's email) or created. Never throws: the pipeline must not break the customer's action.
 */
export async function pipelineEvent(
  event: PipelineEvent,
  accountId: string,
  now = new Date(),
  signup?: { name: string; email: string; company: string },
): Promise<void> {
  try {
    await asSystem(() =>
      db.$transaction(async (tx) => {
        let lead = await tx.lead.findUnique({ where: { accountId } });
        if (!lead && signup) {
          const email = signup.email.toLowerCase();
          const byEmail = await tx.lead.findUnique({ where: { email } });
          if (byEmail && !byEmail.accountId) {
            lead = await tx.lead.update({ where: { id: byEmail.id }, data: { accountId } });
            await activity(
              tx,
              lead.id,
              null,
              "AUTOMATIC",
              "Signed up: linked to their new account",
              now,
            );
          } else if (!byEmail) {
            lead = await tx.lead.create({
              data: {
                name: signup.name,
                company: signup.company,
                email,
                source: "SIGNUP",
                stage: "NEW",
                accountId,
                createdAt: now,
                stageChangedAt: now,
              },
            });
            await activity(tx, lead.id, null, "CREATED", "Signed up on the website", now);
          }
        }
        if (!lead) return;
        const stage = autoStage(lead.stage, event);
        if (!stage) return;
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            stage,
            stageChangedAt: now,
            ...(stage === "LOST"
              ? { lostAt: now, lostReason: "Cancelled" }
              : { lostAt: null, lostReason: null }),
          },
        });
        await activity(
          tx,
          lead.id,
          null,
          "AUTOMATIC",
          `${PIPELINE_EVENT_LABELS[event]}: ${LEAD_STAGE_LABELS[lead.stage]} → ${LEAD_STAGE_LABELS[stage]}`,
          now,
        );
      }),
    );
  } catch (err) {
    reportError(err, `pipeline:${event}`);
  }
}

/** A demo request from the website becomes a New lead (if they aren't in the pipeline yet). */
export async function leadFromDemoRequest(
  r: {
    name: string;
    email: string;
    company: string;
    phone: string;
    units: string;
    message: string;
  },
  now = new Date(),
): Promise<void> {
  try {
    await asSystem(() =>
      db.$transaction(async (tx) => {
        const email = r.email.toLowerCase();
        const existing = await tx.lead.findUnique({ where: { email } });
        if (existing) {
          await activity(
            tx,
            existing.id,
            null,
            "AUTOMATIC",
            `Asked for a demo (${r.units} units)`,
            now,
          );
          return;
        }
        const lead = await tx.lead.create({
          data: {
            name: r.name,
            company: r.company,
            email,
            phone: r.phone || null,
            source: "DEMO_REQUEST",
            notes: r.message,
            createdAt: now,
            stageChangedAt: now,
          },
        });
        await activity(
          tx,
          lead.id,
          null,
          "CREATED",
          `Asked for a demo on the website (${r.units} units)`,
          now,
        );
      }),
    );
  } catch (err) {
    reportError(err, "pipeline:demo-request");
  }
}

// ─── Brevo ───────────────────────────────────────────────────────────────────────────────

/** Put a lead on (or take it off) the marketing list, as its consent says. Never throws. */
export async function syncLead(
  id: string,
  now = new Date(),
  brevo: BrevoClient = brevoClient(),
): Promise<void> {
  if (!brevo.connected) return;
  try {
    const lead = await asSystem(() => db.lead.findUnique({ where: { id } }));
    if (!lead?.email) return;
    if (lead.marketingConsent && !lead.unsubscribedAt) {
      await brevo.addToMarketing({ email: lead.email, name: lead.name, company: lead.company });
    } else {
      await brevo.removeFromMarketing(lead.email);
    }
    await asSystem(() => db.lead.update({ where: { id }, data: { brevoSyncedAt: now } }));
  } catch (err) {
    reportError(err, "brevo-sync");
  }
}

/** Someone unsubscribed in Brevo: no more marketing, recorded on their timeline. */
export async function markUnsubscribed(email: string, now = new Date()): Promise<boolean> {
  const lead = await asSystem(() => db.lead.findUnique({ where: { email: email.toLowerCase() } }));
  if (!lead || (lead.unsubscribedAt && !lead.marketingConsent)) return false;
  await asSystem(() =>
    db.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          marketingConsent: false,
          unsubscribedAt: now,
          consentAt: null,
          consentSource: null,
        },
      });
      await activity(
        tx,
        lead.id,
        null,
        "CONSENT",
        "Unsubscribed from marketing emails (Brevo)",
        now,
      );
    }),
  );
  return true;
}

/**
 * Daily: lost leads past the retention period are deleted; leads changed since their last sync
 * are synced; unsubscribes are pulled from Brevo in case a webhook was missed.
 */
export async function runPipelineHousekeeping(
  now = new Date(),
  brevo: BrevoClient = brevoClient(),
) {
  const lost = await asSystem(() =>
    db.lead.findMany({
      where: { stage: "LOST", lostAt: { not: null } },
      select: { id: true, lostAt: true, email: true },
    }),
  );
  const expired = lost.filter((l) =>
    lostLeadExpired(l.lostAt!, now, PIPELINE.lostLeadRetentionMonths),
  );
  if (expired.length) {
    await asSystem(() => db.lead.deleteMany({ where: { id: { in: expired.map((l) => l.id) } } }));
    for (const l of expired) {
      if (l.email)
        await brevo
          .deleteContact(l.email)
          .catch((err: unknown) => reportError(err, "brevo-delete"));
    }
  }
  let unsubscribed = 0;
  let synced = 0;
  if (brevo.connected) {
    try {
      for (const email of await brevo.unsubscribedSince(new Date(now.getTime() - 3 * 86_400_000))) {
        if (await markUnsubscribed(email, now)) unsubscribed += 1;
      }
    } catch (err) {
      reportError(err, "brevo-unsubscribes");
    }
    const stale = await asSystem(
      () =>
        db.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "Lead" WHERE "email" IS NOT NULL AND ("brevoSyncedAt" IS NULL OR "brevoSyncedAt" < "updatedAt") LIMIT 500`,
    );
    for (const { id } of stale) {
      await syncLead(id, now, brevo);
      synced += 1;
    }
  }
  return { deleted: expired.length, unsubscribed, synced };
}
