import { isReportId } from "@/domain/reports/definitions";
import { requireActor } from "@/server/auth/current";
import { NotFoundError } from "@/server/errors";
import { apiRoute } from "@/server/http";
import { exportReport } from "@/server/reports/export";
import { parseReportFilters } from "@/server/reports/service";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** Download a report as Excel or CSV, with the filters shown on screen. */
export const GET = apiRoute<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor("data.export");
  const { id } = await params;
  if (!isReportId(id)) throw new NotFoundError("We couldn't find that report.");
  const sp = req.nextUrl.searchParams;
  const result = await exportReport(
    actor,
    id,
    parseReportFilters(sp),
    sp.get("format") === "csv" ? "csv" : "xlsx",
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
