import { requireActor } from "@/server/auth/current";
import { fileByKey } from "@/server/documents/service";
import { contentDisposition, storage, verifyLocalLink } from "@/server/documents/storage";
import { NotFoundError } from "@/server/errors";
import { apiRoute } from "@/server/http";

export const dynamic = "force-dynamic";

/** Serve a locally stored file for a signed, unexpired link (and a signed-in user). */
export const GET = apiRoute<{ key: string }>(async (req, { params }) => {
  await requireActor("document.view");
  const { key } = await params;
  const sp = req.nextUrl.searchParams;
  const read = storage().read;
  if (!read || !verifyLocalLink(key, Number(sp.get("e")), sp.get("s") ?? "")) {
    throw new NotFoundError("This link has expired. Please open the document again.");
  }
  const doc = await fileByKey(key);
  if (!doc || doc.archivedAt) throw new NotFoundError("We couldn't find that document.");
  const body = await read(key);
  const inline = doc.contentType === "application/pdf" || doc.contentType.startsWith("image/");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": contentDisposition(doc.fileName, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // PDFs open in the browser's own viewer, which a CSP sandbox would block.
      "Content-Security-Policy":
        doc.contentType === "application/pdf"
          ? "default-src 'none'; object-src 'self'"
          : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
