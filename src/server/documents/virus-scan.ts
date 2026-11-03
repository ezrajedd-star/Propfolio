import { Socket } from "node:net";

import { env } from "@/server/env";

/**
 * Virus scanning for uploads with ClamAV (its `clamd` service, INSTREAM command). Switched on
 * with UPLOAD_VIRUS_SCAN=clamav; the file is streamed to clamd before anything is stored.
 * If scanning is on but clamd can't be reached, uploads are refused rather than stored
 * unchecked.
 */

export type ScanResult = { clean: true } | { clean: false; signature: string };

export class ScannerUnavailableError extends Error {
  constructor(cause: string) {
    super(`Virus scanner unavailable: ${cause}`);
    this.name = "ScannerUnavailableError";
  }
}

const CHUNK = 64 * 1024;
const TIMEOUT_MS = 30_000;

/** Send bytes to clamd and read its verdict ("stream: OK" or "stream: <name> FOUND"). */
export function clamdScan(
  bytes: Uint8Array,
  options: { host: string; port: number; timeoutMs?: number },
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    let settled = false;
    const fail = (cause: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new ScannerUnavailableError(cause));
    };
    socket.setTimeout(options.timeoutMs ?? TIMEOUT_MS, () => fail("timeout"));
    socket.once("error", (err) => fail(err.name));
    socket.on("data", (d: Buffer) => chunks.push(d));
    socket.once("end", () => {
      if (settled) return;
      settled = true;
      const reply = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
      const found = /^stream: (.+) FOUND$/.exec(reply);
      if (reply === "stream: OK") resolve({ clean: true });
      else if (found) resolve({ clean: false, signature: found[1]!.slice(0, 120) });
      else reject(new ScannerUnavailableError(`unexpected reply: ${reply.slice(0, 60)}`));
    });
    socket.connect(options.port, options.host, () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const part = bytes.subarray(i, i + CHUNK);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length);
        socket.write(size);
        socket.write(part);
      }
      socket.end(Buffer.alloc(4)); // a zero-length chunk ends the stream
    });
  });
}

/** Scan an upload when scanning is switched on; otherwise every file counts as clean. */
export async function scanUpload(bytes: Uint8Array): Promise<ScanResult> {
  const e = env();
  if (e.UPLOAD_VIRUS_SCAN === "off") return { clean: true };
  return clamdScan(bytes, { host: e.CLAMAV_HOST, port: e.CLAMAV_PORT });
}
