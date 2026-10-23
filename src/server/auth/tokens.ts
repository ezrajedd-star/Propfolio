import { createHash, randomBytes, randomInt } from "node:crypto";

/** 256-bit random token, URL-safe. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// No 0/O, 1/l/I to keep temporary passwords easy to read out loud or copy by hand.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A one-time password like `k7Pm-3xQa-9TbR` for new accounts. Must be changed at first sign-in. */
export function temporaryPassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}
