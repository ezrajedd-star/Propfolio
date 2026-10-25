import { requireActor } from "@/server/auth/current";
import { getCalendarEvents } from "@/server/calendar/service";
import { apiRoute } from "@/server/http";

export const dynamic = "force-dynamic";

/** Calendar events for a date range. Viewers only get lease start/end dates and tenant names. */
export const GET = apiRoute(async (req) => {
  const actor = await requireActor("occupancy.view");
  return { events: await getCalendarEvents(actor, Object.fromEntries(req.nextUrl.searchParams)) };
});
