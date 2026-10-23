import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/server/env";
import { AppError, ForbiddenError } from "@/server/errors";

type RouteContext<P> = { params: Promise<P> };

/**
 * Wrap an API route handler:
 * - rejects cross-site requests that change data (CSRF): Origin must match APP_URL,
 * - turns service errors into JSON with the right status code,
 * - never leaks internal error details.
 */
export function apiRoute<P = Record<string, never>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...("fieldErrors" in err ? { fieldErrors: err.fieldErrors } : {}),
        },
      },
      { status: err.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  // Log the error type only; messages from the database can contain submitted values.
  console.error("[api] unexpected error:", err instanceof Error ? err.name : typeof err);
  if (process.env.NODE_ENV !== "production") console.error(err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } },
    { status: 500 },
  );
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = new URL(env().APP_URL).origin;
  if (!origin || (origin !== allowed && origin !== req.nextUrl.origin)) {
    throw new ForbiddenError("This request was blocked for your security. Please reload the page.");
  }
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
