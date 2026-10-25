"use server";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { saveGuideState } from "@/server/preferences";

/** Remember the tour as done, or the Guide as on/off, for the signed-in person. */
export async function saveGuideStateAction(input: { tourDone?: boolean; on?: boolean }) {
  return runAction(async () => saveGuideState(await requireActor(), input));
}
