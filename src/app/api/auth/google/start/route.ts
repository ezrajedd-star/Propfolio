import { NextResponse, type NextRequest } from "next/server";

import { GOOGLE_STATE_MINUTES } from "@/domain/auth/google";
import { safeNext } from "@/lib/safe-next";
import { setGoogleStateCookie } from "@/server/auth/current";
import { googleEnabled, startGoogleSignIn } from "@/server/auth/google";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** "Continue with Google": remember where we are (state, nonce, PKCE) and go to Google. */
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login", base), 303);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const persistent = req.nextUrl.searchParams.get("remember") === "1";
  const { url, state } = startGoogleSignIn(next, persistent);
  await setGoogleStateCookie(
    JSON.stringify(state),
    new Date(Date.now() + GOOGLE_STATE_MINUTES * 60_000),
  );
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
