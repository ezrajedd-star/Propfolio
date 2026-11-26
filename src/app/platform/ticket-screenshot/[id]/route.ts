import type { NextRequest } from "next/server";

import { serveStoredImage } from "@/server/documents/serve";
import { requirePlatformActor } from "@/server/platform/current";
import { metaFromHeaders } from "@/server/request-meta";
import { staffScreenshot } from "@/server/tickets/service";

export const dynamic = "force-dynamic";

/** A screenshot on a ticket, for staff (logged in the staff log). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformActor("tickets.view");
    const { id } = await params;
    return await serveStoredImage(await staffScreenshot(admin, id, metaFromHeaders(req.headers)));
  } catch {
    return new Response(null, { status: 404 });
  }
}
