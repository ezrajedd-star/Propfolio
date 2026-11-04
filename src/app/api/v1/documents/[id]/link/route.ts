import { NextResponse } from "next/server";

import { requireActor } from "@/server/auth/current";
import { env } from "@/server/env";
import { documentLink } from "@/server/documents/service";
import { apiRoute } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** Open a document: permission check + audit, then a redirect to a 5-minute link. */
export const GET = apiRoute<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor("document.view");
  const { id } = await params;
  const url = await documentLink(actor, id, metaFromHeaders(req.headers));
  // Behind the reverse proxy the request's own origin is the internal address (0.0.0.0:3000),
  // so the redirect is built from the public APP_URL.
  return NextResponse.redirect(new URL(url, env().APP_URL), {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
});
