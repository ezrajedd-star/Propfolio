import { getCurrentSession } from "@/server/auth/current";
import { UnauthenticatedError } from "@/server/errors";
import { apiRoute } from "@/server/http";

/**
 * Called by the browser (at most every few minutes) while the user is actively using the
 * page, so typing in a long form counts as activity for the 30-minute idle timeout.
 */
export const POST = apiRoute(async () => {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();
  return { ok: true };
});
