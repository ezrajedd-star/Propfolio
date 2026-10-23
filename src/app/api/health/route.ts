import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness for Docker. No authentication; reveals nothing. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
