import { notFound } from "next/navigation";

import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";

/**
 * For pages: an unknown, archived-away or malformed id shows the "not found" page (HTTP 404)
 * instead of an error. Anything else still fails loudly.
 */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

/** A page address with a malformed id is "not found", before any lookup runs. */
export function assertIdOrNotFound(id: string): void {
  if (!isUuid(id)) notFound();
}
