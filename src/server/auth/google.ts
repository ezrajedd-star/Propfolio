import { createHash, randomBytes } from "node:crypto";

import { checkIdToken, decodeJwtPayload, type GoogleProfile } from "@/domain/auth/google";
import { env } from "@/server/env";

export function googleEnabled(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env().APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
}

/** What the browser keeps (in a short-lived, httpOnly cookie) while it is away at Google. */
export interface GoogleState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  persistent: boolean;
}

/** Where to send the browser, and what to remember until it comes back. */
export function startGoogleSignIn(
  next: string,
  persistent: boolean,
): { url: string; state: GoogleState } {
  const s: GoogleState = {
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    next,
    persistent,
  };
  const challenge = createHash("sha256").update(s.verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: s.state,
    nonce: s.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), state: s };
}

/**
 * Swap the code Google sent back for the person's verified profile. Null when anything is off
 * (only the reason's type is logged, never the token or the email).
 */
export async function finishGoogleSignIn(
  code: string,
  saved: GoogleState,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<GoogleProfile | null> {
  try {
    const res = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env().GOOGLE_CLIENT_ID!,
        client_secret: env().GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}`);
    const data = (await res.json()) as { id_token?: unknown };
    if (typeof data.id_token !== "string") throw new Error("no id_token");
    const check = checkIdToken(decodeJwtPayload(data.id_token), {
      clientId: env().GOOGLE_CLIENT_ID!,
      nonce: saved.nonce,
      now,
    });
    if (!check.ok) {
      console.warn("[google] ID token refused:", check.reason);
      return null;
    }
    return check.profile;
  } catch (err) {
    console.warn("[google] sign-in failed:", (err as Error).message.slice(0, 80));
    return null;
  }
}
