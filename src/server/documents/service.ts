import { createHash, randomUUID } from "node:crypto";

import type { DocumentCategory } from "@prisma/client";
import { z } from "zod";

import { can } from "@/domain/auth/roles";
import {
  cleanFileName,
  detectDocumentType,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
} from "@/domain/documents/file-type";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { storage } from "./storage";

export const DOCUMENT_CATEGORIES = ["SIGNED_CONTRACT", "AMENDMENT", "ID", "OTHER"] as const;
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  SIGNED_CONTRACT: "Signed contract",
  AMENDMENT: "Amendment",
  ID: "ID",
  OTHER: "Other",
};

const uploadSchema = z
  .object({
    leaseId: z.uuid().optional(),
    tenantId: z.uuid().optional(),
    category: z.enum(DOCUMENT_CATEGORIES, { error: "Choose what kind of document this is." }),
  })
  .refine((v) => v.leaseId || v.tenantId, { message: "Choose a lease or tenant." });

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/** Upload a document to a lease (it also shows on the tenant) or to a tenant only. */
export async function uploadDocument(
  actor: AuditActor,
  input: unknown,
  file: UploadedFile | null,
  meta: RequestMeta,
) {
  assertCan(actor, "document.upload");
  const data = parseInput(uploadSchema, input);
  if (!file || file.bytes.length === 0) {
    throw new ValidationError("Please check the highlighted fields.", {
      file: "Choose a file to upload.",
    });
  }
  if (file.bytes.length > MAX_DOCUMENT_BYTES) {
    throw new ValidationError("Please check the highlighted fields.", {
      file: "This file is larger than 20 MB. Please scan it at a lower resolution or split it.",
    });
  }
  const ext = detectDocumentType(file.bytes);
  if (!ext) {
    throw new ValidationError("Please check the highlighted fields.", {
      file: "Only PDF, JPG, PNG or Word (DOCX) files can be uploaded.",
    });
  }

  let tenantId = data.tenantId;
  const leaseId = data.leaseId ?? null;
  if (leaseId) {
    const lease = await db.lease.findUnique({
      where: { id: leaseId },
      select: { tenantId: true, archivedAt: true },
    });
    if (!lease || lease.archivedAt) throw new NotFoundError("We couldn't find that lease.");
    tenantId = lease.tenantId;
  }
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId! },
    select: { archivedAt: true, anonymizedAt: true },
  });
  if (!tenant || tenant.archivedAt || tenant.anonymizedAt)
    throw new NotFoundError("We couldn't find that tenant.");

  const contentType = DOCUMENT_TYPES[ext].contentType;
  const key = randomUUID();
  await storage().put(key, file.bytes, contentType);
  try {
    return await db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: tenantId!,
          leaseId,
          category: data.category,
          fileName: cleanFileName(file.name, ext),
          contentType,
          sizeBytes: file.bytes.length,
          sha256: createHash("sha256").update(file.bytes).digest("hex"),
          storageKey: key,
          uploadedById: actor.id,
        },
      });
      // File names can contain personal data, so the log records the document id and type only.
      await writeAudit(
        {
          actor,
          action: "document.upload",
          entityType: leaseId ? "Lease" : "Tenant",
          entityId: leaseId ?? tenantId!,
          metadata: {
            documentId: doc.id,
            category: doc.category,
            type: ext,
            sizeBytes: doc.sizeBytes,
          },
          meta,
        },
        tx,
      );
      return doc;
    });
  } catch (err) {
    await storage()
      .remove(key)
      .catch(() => undefined);
    throw err;
  }
}

export interface DocumentRow {
  id: string;
  category: DocumentCategory;
  categoryLabel: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: string | null;
  leaseId: string | null;
  leaseRefNo: string | null;
  archived: boolean;
  archiveReason: string | null;
}

/** Documents of a lease, or all documents of a tenant (including those on their leases). */
export async function listDocuments(
  actor: AuditActor,
  where: { leaseId: string } | { tenantId: string },
  opts: { includeArchived?: boolean } = {},
): Promise<{ rows: DocumentRow[]; canUpload: boolean }> {
  assertCan(actor, "document.view");
  const id = "leaseId" in where ? where.leaseId : where.tenantId;
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that record.");
  const docs = await db.document.findMany({
    where: { ...where, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "desc" },
  });
  const userIds = [...new Set(docs.map((d) => d.uploadedById).filter((x): x is string => !!x))];
  const leaseIds = [...new Set(docs.map((d) => d.leaseId).filter((x): x is string => !!x))];
  const [users, leases] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    db.lease.findMany({ where: { id: { in: leaseIds } }, select: { id: true, refNo: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const refNo = new Map(leases.map((l) => [l.id, l.refNo]));
  return {
    canUpload: can(actor.role, "document.upload"),
    rows: docs.map((d) => ({
      id: d.id,
      category: d.category,
      categoryLabel: DOCUMENT_CATEGORY_LABELS[d.category],
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.createdAt,
      uploadedBy: d.uploadedById ? (userName.get(d.uploadedById) ?? null) : null,
      leaseId: d.leaseId,
      leaseRefNo: d.leaseId ? (refNo.get(d.leaseId) ?? null) : null,
      archived: d.archivedAt !== null,
      archiveReason: d.archiveReason,
    })),
  };
}

/**
 * Permission check, audit entry, then a link that works for 5 minutes. Every view or
 * download goes through here.
 */
export async function documentLink(
  actor: AuditActor,
  documentId: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<string> {
  assertCan(actor, "document.view");
  if (!isUuid(documentId)) throw new NotFoundError("We couldn't find that document.");
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.archivedAt) throw new NotFoundError("We couldn't find that document.");
  await writeAudit({
    actor,
    action: "document.download",
    entityType: doc.leaseId ? "Lease" : "Tenant",
    entityId: doc.leaseId ?? doc.tenantId,
    metadata: { documentId: doc.id, category: doc.category },
    meta,
  });
  return storage().signedUrl(
    { key: doc.storageKey, contentType: doc.contentType, fileName: doc.fileName },
    now,
  );
}

/** Find a stored file by its key (signed-link route, after the link is verified). */
export async function fileByKey(key: string) {
  return db.document.findUnique({
    where: { storageKey: key },
    select: { contentType: true, fileName: true, archivedAt: true },
  });
}

/** Archive a document uploaded by mistake (it stays on record; Admins can still see it). */
export async function archiveDocument(
  actor: AuditActor,
  documentId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "document.upload");
  const { reason } = parseInput(
    z.object({
      reason: z.string().trim().min(5, "Please give the reason in a few words.").max(500),
    }),
    input,
  );
  if (!isUuid(documentId)) throw new NotFoundError("We couldn't find that document.");
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new NotFoundError("We couldn't find that document.");
  if (doc.archivedAt) throw new ValidationError("This document was already removed.");
  return db.$transaction(async (tx) => {
    const d = await tx.document.update({
      where: { id: documentId },
      data: { archivedAt: now, archivedById: actor.id, archiveReason: reason },
    });
    await writeAudit(
      {
        actor,
        action: "document.archive",
        entityType: doc.leaseId ? "Lease" : "Tenant",
        entityId: doc.leaseId ?? doc.tenantId,
        metadata: { documentId, category: doc.category, reason },
        meta,
      },
      tx,
    );
    return d;
  });
}
