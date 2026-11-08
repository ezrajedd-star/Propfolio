import type { NextRequest } from "next/server";

import { requirePlatformActor } from "@/server/platform/current";
import { metaFromHeaders } from "@/server/request-meta";
import { exportPayments, paymentRange } from "@/server/subscription/export";

export const dynamic = "force-dynamic";

/** The bookkeeper's Excel export of payment records (platform admin only). */
export async function GET(req: NextRequest) {
  let admin;
  try {
    admin = await requirePlatformActor();
  } catch {
    return new Response(null, { status: 401 });
  }
  const range = paymentRange(
    req.nextUrl.searchParams.get("from"),
    req.nextUrl.searchParams.get("to"),
  );
  const body = await exportPayments(admin, range, metaFromHeaders(req.headers));
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Propfolio payments ${range.from} to ${range.to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
