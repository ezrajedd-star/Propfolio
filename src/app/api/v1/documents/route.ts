import { requireActor } from "@/server/auth/current";
import { uploadDocument } from "@/server/documents/service";
import { apiRoute } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** Upload a document (multipart form: file, category, leaseId or tenantId). */
export const POST = apiRoute(async (req) => {
  const actor = await requireActor("document.upload");
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 21 * 1024 * 1024) {
    return Response.json(
      { error: { code: "VALIDATION", message: "This file is larger than 20 MB." } },
      { status: 413 },
    );
  }
  const form = await req.formData();
  const file = form.get("file");
  const doc = await uploadDocument(
    actor,
    {
      category: form.get("category") || undefined,
      leaseId: form.get("leaseId") || undefined,
      tenantId: form.get("tenantId") || undefined,
    },
    file instanceof File
      ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      : null,
    metaFromHeaders(req.headers),
  );
  return { id: doc.id };
});
