import { requireActor } from "@/server/auth/current";
import { serveStoredImage } from "@/server/documents/serve";
import { apiRoute } from "@/server/http";
import { myScreenshot } from "@/server/tickets/service";

export const dynamic = "force-dynamic";

/** A screenshot the signed-in person attached to one of their own help requests. */
export const GET = apiRoute<{ id: string }>(async (_req, { params }) => {
  const actor = await requireActor(undefined, { personal: true });
  const { id } = await params;
  return serveStoredImage(await myScreenshot(actor, id));
});
