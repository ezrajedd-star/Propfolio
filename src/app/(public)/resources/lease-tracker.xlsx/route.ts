import { env } from "@/server/env";
import { leaseTrackerWorkbook } from "@/server/website-leads/lease-tracker";

export const dynamic = "force-dynamic";

/** The free Excel lease tracker. Public: it holds no customer data. */
export async function GET() {
  const body = await leaseTrackerWorkbook(env().APP_URL);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Propfolio lease tracker.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
