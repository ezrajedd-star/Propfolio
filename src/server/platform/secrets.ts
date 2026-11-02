import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { appSecret } from "@/server/env";

/**
 * Authenticator secrets are stored encrypted (AES-256-GCM) with a key derived from APP_SECRET,
 * so a copy of the database alone can't be used to produce sign-in codes.
 */
function key(): Buffer {
  return createHash("sha256").update(`propfolio:platform-totp:${appSecret()}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
