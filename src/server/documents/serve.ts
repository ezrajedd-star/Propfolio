import { contentDisposition, storage, type StoredFile } from "./storage";

/**
 * Send a stored picture to someone already allowed to see it: the bytes for the local folder
 * driver, or a redirect to a short-lived link for S3.
 */
export async function serveStoredImage(file: StoredFile, now = new Date()): Promise<Response> {
  const s = storage();
  if (s.read) {
    const body = await s.read(file.key);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": contentDisposition(file.fileName, true),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      },
    });
  }
  return Response.redirect(await s.signedUrl(file, now), 302);
}
