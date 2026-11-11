import { NextResponse, type NextRequest } from "next/server";

/**
 * The address "/" serves two things: signed-in people get their Propfolio home (the app), and
 * everyone else gets the website's home page (served from /welcome, the address stays "/").
 * Only the presence of the session cookie is checked here; the app itself still validates the
 * session (an expired one goes to sign-in as before).
 */
export function proxy(request: NextRequest) {
  const signedIn =
    request.cookies.has("__Host-propfolio_session") || request.cookies.has("propfolio_session");
  if (signedIn) return NextResponse.next();
  return NextResponse.rewrite(new URL("/welcome", request.url));
}

export const config = { matcher: "/" };
