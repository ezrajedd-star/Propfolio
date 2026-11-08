import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/safe-next";
import {
  getDeviceToken,
  setDeviceCookie,
  setPendingSignInCookie,
  setSessionCookie,
  setSignUpCookie,
  takeGoogleStateCookie,
} from "@/server/auth/current";
import { finishGoogleSignIn, googleEnabled, type GoogleState } from "@/server/auth/google";
import { env } from "@/server/env";
import { requestMeta } from "@/server/request-meta";
import { googleSignIn } from "@/server/signup/service";
import { acceptInvitationWithGoogle } from "@/server/team/service";

export const dynamic = "force-dynamic";

function parseState(raw: string | undefined): GoogleState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GoogleState;
    return typeof s.state === "string" &&
      typeof s.nonce === "string" &&
      typeof s.verifier === "string"
      ? s
      : null;
  } catch {
    return null;
  }
}

/** Google sends the browser back here with a one-time code. */
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  const go = (path: string) =>
    NextResponse.redirect(new URL(path, base), {
      status: 303,
      headers: { "Cache-Control": "no-store" },
    });
  // Only a short reason code goes in the address; the page has the wording (no text injection).
  const fail = (reason: string) => go(`/login?reason=${reason}`);

  const saved = parseState(await takeGoogleStateCookie());
  const params = req.nextUrl.searchParams;
  if (!googleEnabled() || !saved) return go("/login");
  // They pressed Cancel at Google: nothing to say.
  if (params.get("error")) return go("/login");
  // A forged or stale return: the state must match what this browser set.
  if (params.get("state") !== saved.state || !params.get("code")) {
    return fail("google-failed");
  }

  const profile = await finishGoogleSignIn(params.get("code")!, saved);
  if (!profile) return fail("google-failed");

  const r = await googleSignIn(
    profile,
    await requestMeta(),
    new Date(),
    await getDeviceToken(),
    saved.persistent,
  );
  if (r.ok) {
    await setSessionCookie(r.token, r.expiresAt);
    if (r.deviceToken) await setDeviceCookie(r.deviceToken.token, r.deviceToken.expiresAt);
    return go(r.mustChangePassword ? "/change-password" : safeNext(saved.next));
  }
  switch (r.reason) {
    case "code_needed":
      await setPendingSignInCookie(r.challengeToken, r.expiresAt);
      return go(
        saved.next !== "/"
          ? `/login/code?next=${encodeURIComponent(safeNext(saved.next))}`
          : "/login/code",
      );
    case "needs_details": {
      // Someone new who came from an invitation joins that team instead of starting an account.
      const invite = /^\/invite\/([A-Za-z0-9_-]{20,200})$/.exec(safeNext(saved.next));
      if (invite) {
        try {
          const session = await acceptInvitationWithGoogle(
            invite[1]!,
            profile,
            await requestMeta(),
          );
          await setSessionCookie(session.token, session.expiresAt);
          return go("/?welcome=joined");
        } catch {
          return go(`/invite/${invite[1]}?error=google`);
        }
      }
      await setSignUpCookie(r.token, r.expiresAt);
      return go("/signup/google");
    }
    default:
      // locked, rate_limited, inactive, user_limit, suspended, google_mismatch, invalid
      return fail(r.reason.replace(/_/g, "-"));
  }
}
