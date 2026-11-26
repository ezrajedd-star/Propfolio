import type { NextRequest } from "next/server";

import { asSystem, db } from "@/server/db";
import { workerStatus } from "@/server/monitoring/incidents";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness for Docker. No authentication; reveals nothing. With `?deep=1` (for the
 * outside uptime monitor) it also fails when the background worker has stopped checking in.
 */
export async function GET(req: NextRequest) {
  try {
    await asSystem(() => db.$queryRaw`SELECT 1`);
    if (req.nextUrl.searchParams.get("deep") === "1" && !(await workerStatus()).ok) {
      return Response.json({ status: "unavailable" }, { status: 503 });
    }
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
