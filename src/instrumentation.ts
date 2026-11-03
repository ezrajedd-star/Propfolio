import type { Instrumentation } from "next";

/** Errors while rendering pages (outside actions and API routes) reach the error tracker too. */
export const onRequestError: Instrumentation.onRequestError = async (err, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/server/monitoring/report-error");
  reportError(err, `${context.routeType}:${context.routePath}`);
};
