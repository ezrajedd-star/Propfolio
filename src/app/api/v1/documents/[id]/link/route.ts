import { NextResponse } from "next/server";

import { requireActor } from "@/server/auth/current";
import { documentLink } from "@/server/documents/service";
import { apiRoute } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** Open a document: permission check + audit, then a redirect to a 5-minute link. */
export const GET = apiRoute<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor("document.view");
  const { id } = await params;
  const url = await documentLink(actor, id, metaFromHeaders(req.headers));
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
});
