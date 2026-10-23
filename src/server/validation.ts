import type { z } from "zod";

import { ValidationError } from "@/server/errors";

/** Map Zod issues to `{ field: message }`, keeping the first message per field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Validate untrusted input on the server with the same schema the form uses. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Please check the highlighted fields.", fieldErrors(result.error));
  }
  return result.data;
}
