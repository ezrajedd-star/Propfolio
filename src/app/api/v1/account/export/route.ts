import { exportAccountData } from "@/server/accounts/export";
import { requireActor } from "@/server/auth/current";
import { apiRoute } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** All the account's data in one Excel file (the Owner only). */
export const GET = apiRoute(async (req) => {
  const actor = await requireActor("billing.manage", { duringReadOnly: true });
  const { filename, body } = await exportAccountData(actor, metaFromHeaders(req.headers));
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
});
