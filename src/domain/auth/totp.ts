import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time codes (RFC 6238), as shown by authenticator apps: a new 6-digit code
 * every 30 seconds from a shared secret. Pure computation, no I/O.
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Accept the code from one step before or after, to allow for a phone clock that's a bit off. */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Spaces, dashes and lower case are ignored; anything else not in the alphabet is an error. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits, the RFC's recommendation for SHA-1), base32-encoded. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 30-second step a moment falls in. */
export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for a step (HOTP, RFC 4226, with SHA-1 as authenticator apps expect). */
export function totpCode(secret: Buffer, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Check a typed code. Returns the step it matched (store it, and refuse that step or an earlier
 * one next time, so a code can't be used twice), or null.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now: Date,
  lastUsedStep: number | null = null,
): number | null {
  const typed = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(typed)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(now);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = current + delta;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(typed))) return step;
  }
  return null;
}

/** The link an authenticator app reads from the QR code. */
export function totpUri(secretBase32: string, account: string, issuer = "Propfolio"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
