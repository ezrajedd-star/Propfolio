import { NextResponse, type NextRequest } from "next/server";

/**
 * The address "/" serves two things: signed-in people get their Propfolio home (the app), and
 * everyone else gets the website's home page (served from /welcome, the address stays "/").
 * Only the presence of the session cookie is checked here; the app itself still validates the
 * session (an expired one goes to sign-in as before).
 *
 * Every page also gets its address in an `x-pathname` request header, so the audit log can say
 * which page Propfolio support opened (support access).
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  if (request.nextUrl.pathname !== "/") return NextResponse.next({ request: { headers } });
  const signedIn =
    request.cookies.has("__Host-propfolio_session") || request.cookies.has("propfolio_session");
  if (signedIn) return NextResponse.next({ request: { headers } });
  return NextResponse.rewrite(new URL("/welcome", request.url), { request: { headers } });
}

export const config = {
  // Pages only: not API routes, static files or images.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon|.*\\.(?:png|svg|jpg|ico|webp|txt|xml)$).*)",
  ],
};
