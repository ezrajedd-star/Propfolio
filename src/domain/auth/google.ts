/**
 * "Continue with Google" (OpenID Connect, authorisation code flow with PKCE). The ID token comes
 * straight from Google's token endpoint over TLS, using our client secret, so (as the OpenID
 * Connect spec allows) its claims are checked here rather than its signature.
 */
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
/** The browser has this long between leaving for Google and coming back. */
export const GOOGLE_STATE_MINUTES = 10;

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

export type IdTokenCheck =
  | { ok: true; profile: GoogleProfile }
  | {
      ok: false;
      reason: "malformed" | "issuer" | "audience" | "expired" | "nonce" | "unverified_email";
    };

/** Decode a JWT's payload (no signature check: see above). */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function checkIdToken(
  payload: Record<string, unknown> | null,
  expected: { clientId: string; nonce: string; now: Date },
): IdTokenCheck {
  if (!payload) return { ok: false, reason: "malformed" };
  const { iss, aud, exp, nonce, sub, email, email_verified: verified, name } = payload;
  if (typeof iss !== "string" || !GOOGLE_ISSUERS.includes(iss))
    return { ok: false, reason: "issuer" };
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(expected.clientId)) return { ok: false, reason: "audience" };
  if (typeof exp !== "number" || exp * 1000 <= expected.now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (nonce !== expected.nonce) return { ok: false, reason: "nonce" };
  if (typeof sub !== "string" || !sub || typeof email !== "string" || !email.includes("@")) {
    return { ok: false, reason: "malformed" };
  }
  if (verified !== true && verified !== "true") return { ok: false, reason: "unverified_email" };
  const cleanEmail = email.trim().toLowerCase();
  const cleanName =
    typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : cleanEmail.split("@")[0]!;
  return { ok: true, profile: { sub, email: cleanEmail, name: cleanName } };
}
