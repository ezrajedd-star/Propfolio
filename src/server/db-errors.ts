import { Prisma } from "@prisma/client";

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** The database rejected overlapping leases on the same unit (exclusion constraint). */
export function isLeaseOverlapViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Lease_no_overlap");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed ids are treated as "not found" (never as a server error). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
