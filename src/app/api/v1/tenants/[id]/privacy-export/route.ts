import { manilaToday } from "@/domain/time/manila";
import { requireActor } from "@/server/auth/current";
import { apiRoute } from "@/server/http";
import { exportTenantData } from "@/server/privacy/service";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** Admin: download everything held about one tenant, as JSON (audited). */
export const GET = apiRoute<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor("privacy.manage");
  const { id } = await params;
  const data = await exportTenantData(actor, id, metaFromHeaders(req.headers));
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="propfolio-tenant-data-${manilaToday()}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
