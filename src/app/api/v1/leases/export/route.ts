import { LEASE_STATUSES, type LeaseStatus } from "@/domain/leases/status";
import { requireActor } from "@/server/auth/current";
import { apiRoute } from "@/server/http";
import { exportLeases } from "@/server/leases/export";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** Download the leases grid as Excel or CSV, using the same filters the grid shows. */
export const GET = apiRoute(async (req) => {
  const actor = await requireActor("data.export");
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const ending = Number(sp.get("ending"));
  const result = await exportLeases(
    actor,
    {
      format: sp.get("format") === "csv" ? "csv" : "xlsx",
      columns: (sp.get("columns") ?? "").split(",").filter(Boolean),
      filters: {
        q: sp.get("q") ?? undefined,
        status: LEASE_STATUSES.includes(status as LeaseStatus)
          ? (status as LeaseStatus)
          : undefined,
        endingWithinDays:
          status === "CURRENT"
            ? Number.MAX_SAFE_INTEGER
            : [30, 60, 90].includes(ending)
              ? ending
              : undefined,
        buildingId: sp.get("building") ?? undefined,
        unitTypeId: sp.get("unitType") ?? undefined,
        includeArchived: sp.get("archived") === "1",
        ids: sp.get("ids") ? sp.get("ids")!.split(",").slice(0, 2000) : undefined,
      },
    },
    metaFromHeaders(req.headers),
  );
  return new Response(new Uint8Array(result.body), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
