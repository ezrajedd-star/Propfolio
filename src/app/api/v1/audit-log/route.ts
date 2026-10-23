import { listAuditLog } from "@/server/audit-log/service";
import { requireActor } from "@/server/auth/current";
import { apiRoute } from "@/server/http";

export const GET = apiRoute(async (req) => {
  const actor = await requireActor("audit.view");
  return listAuditLog(actor, Object.fromEntries(req.nextUrl.searchParams));
});
