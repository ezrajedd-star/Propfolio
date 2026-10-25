import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { appSecret, env } from "@/server/env";

/** Download links stop working after 5 minutes. */
export const SIGNED_URL_SECONDS = 300;

export interface StoredFile {
  key: string;
  contentType: string;
  fileName: string;
}

interface StorageDriver {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** A short-lived link to the file, issued only after the permission check. */
  signedUrl(file: StoredFile, now: Date): Promise<string>;
  /** Local driver only: the file's bytes (served by the signed-link route). */
  read?(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

// ─── Local folder (development, single-server deployments) ─────────────────────

function localPath(key: string): string {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid storage key");
  return path.resolve(env().STORAGE_DIR, key.slice(0, 2), key);
}

function signature(key: string, expires: number): string {
  return createHmac("sha256", appSecret()).update(`${key}.${expires}`).digest("base64url");
}

/** Check a local download link: correct signature and not expired. */
export function verifyLocalLink(
  key: string,
  expires: number,
  sig: string,
  now = new Date(),
): boolean {
  if (!Number.isFinite(expires) || expires * 1000 < now.getTime()) return false;
  const expected = Buffer.from(signature(key, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const localDriver: StorageDriver = {
  async put(key, body) {
    const file = localPath(key);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, body, { mode: 0o600, flag: "wx" });
  },
  async signedUrl(file, now) {
    const expires = Math.floor(now.getTime() / 1000) + SIGNED_URL_SECONDS;
    const q = new URLSearchParams({ e: String(expires), s: signature(file.key, expires) });
    return `/api/v1/files/${file.key}?${q}`;
  },
  read: (key) => readFile(localPath(key)),
  async remove(key) {
    await rm(localPath(key), { force: true });
  },
};

// ─── S3-compatible bucket (production) ─────────────────────────────────────────

let s3: S3Client | undefined;
function s3Client(): S3Client {
  const e = env();
  s3 ??= new S3Client({
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: Boolean(e.S3_ENDPOINT),
    credentials:
      e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return s3;
}

function bucket(): string {
  const b = env().S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not set");
  return b;
}

const s3Driver: StorageDriver = {
  async put(key, body, contentType) {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
  },
  async signedUrl(file) {
    return getSignedUrl(
      s3Client(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: file.key,
        ResponseContentType: file.contentType,
        ResponseContentDisposition: contentDisposition(file.fileName),
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  },
  async remove() {
    // Files in S3 are kept; bucket lifecycle rules handle removal after the retention period.
  },
};

export function storage(): StorageDriver {
  return env().STORAGE_DRIVER === "s3" ? s3Driver : localDriver;
}

/** `attachment` with a safe ASCII fallback and the real (UTF-8) name. */
export function contentDisposition(fileName: string, inline = false): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
