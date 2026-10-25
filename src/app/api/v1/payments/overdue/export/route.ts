import { requireActor } from "@/server/auth/current";
import { exportOverdue } from "@/server/billing/export";
import { apiRoute } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** Download the overdue list as Excel or CSV. */
export const GET = apiRoute(async (req) => {
  const actor = await requireActor("data.export");
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const result = await exportOverdue(actor, format, metaFromHeaders(req.headers));
  return new Response(new Uint8Array(result.body), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
