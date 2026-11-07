import { requireActor } from "@/server/auth/current";
import { apiRoute } from "@/server/http";
import { importTemplate } from "@/server/import/service";

export const dynamic = "force-dynamic";

/** The Excel template for importing buildings, units, tenants and leases. */
export const GET = apiRoute(async () => {
  const actor = await requireActor("property.manage");
  const body = await importTemplate(actor);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Propfolio import template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
});
