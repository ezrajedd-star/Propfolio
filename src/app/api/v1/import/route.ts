import { requireActor } from "@/server/auth/current";
import { apiRoute } from "@/server/http";
import { IMPORT_MAX_BYTES, checkImportFile, runImport } from "@/server/import/service";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/**
 * Upload an import file (multipart: file). `?mode=check` reads and checks it (nothing saved);
 * `?mode=run` checks it again and saves everything, or nothing.
 */
export const POST = apiRoute(async (req) => {
  const actor = await requireActor("property.manage");
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > IMPORT_MAX_BYTES + 64 * 1024) {
    return Response.json(
      { error: { code: "VALIDATION", message: "This file is larger than 2 MB." } },
      { status: 413 },
    );
  }
  const form = await req.formData();
  const raw = form.get("file");
  const file =
    raw instanceof File ? { name: raw.name, bytes: new Uint8Array(await raw.arrayBuffer()) } : null;
  if (req.nextUrl.searchParams.get("mode") === "run") {
    return runImport(actor, file, metaFromHeaders(req.headers));
  }
  const check = await checkImportFile(actor, file);
  return check.ok
    ? {
        ok: true,
        counts: {
          Buildings: check.plan.buildings.length,
          Units: check.plan.units.length,
          Tenants: check.plan.tenants.length,
          Leases: check.plan.leases.length,
        },
      }
    : check;
});
