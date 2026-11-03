import { createServer, type Server } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clamdScan, ScannerUnavailableError } from "@/server/documents/virus-scan";
import { auditActions, makeProperty, makeTenant, makeUser, meta, resetDb } from "./helpers";

// The standard harmless test file every virus scanner reports.
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/** A pretend clamd: reads the INSTREAM chunks and answers like the real one. */
function fakeClamd(): Promise<{ server: Server; port: number; received: () => string }> {
  let last = "";
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (d: Buffer) => {
      buffer = Buffer.concat([buffer, d]);
      const command = "zINSTREAM\0";
      if (buffer.length < command.length) return;
      let offset = command.length;
      const parts: Buffer[] = [];
      while (offset + 4 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        if (size === 0) {
          last = Buffer.concat(parts).toString("latin1");
          socket.end(
            last.includes("EICAR") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0",
          );
          return;
        }
        if (offset + 4 + size > buffer.length) return;
        parts.push(buffer.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        port: typeof address === "object" && address ? address.port : 0,
        received: () => last,
      });
    }),
  );
}

describe("ClamAV client", () => {
  let clamd: Awaited<ReturnType<typeof fakeClamd>>;
  beforeAll(async () => {
    clamd = await fakeClamd();
  });
  afterAll(() => clamd.server.close());

  it("streams the whole file and reports it clean", async () => {
    const big = new Uint8Array(200_000).fill(65); // several 64 KB chunks
    expect(await clamdScan(big, { host: "127.0.0.1", port: clamd.port })).toEqual({ clean: true });
    expect(clamd.received()).toHaveLength(200_000);
  });

  it("reports the virus name", async () => {
    expect(
      await clamdScan(new TextEncoder().encode(EICAR), { host: "127.0.0.1", port: clamd.port }),
    ).toEqual({ clean: false, signature: "Eicar-Test-Signature" });
  });

  it("says when the scanner can't be reached or doesn't answer", async () => {
    await expect(
      clamdScan(new Uint8Array([1]), { host: "127.0.0.1", port: 1 }),
    ).rejects.toBeInstanceOf(ScannerUnavailableError);
    const silent = createServer(() => undefined);
    await new Promise<void>((r) => silent.listen(0, "127.0.0.1", () => r()));
    const port = (silent.address() as { port: number }).port;
    await expect(
      clamdScan(new Uint8Array([1]), { host: "127.0.0.1", port, timeoutMs: 200 }),
    ).rejects.toBeInstanceOf(ScannerUnavailableError);
    silent.close();
  });
});

const scan = vi.hoisted(() => ({ result: { clean: true } as unknown, fail: false }));
vi.mock("@/server/documents/virus-scan", async (original) => ({
  ...(await original<typeof import("@/server/documents/virus-scan")>()),
  scanUpload: async () => {
    if (scan.fail) throw new Error("connect ECONNREFUSED");
    return scan.result;
  },
}));

describe("uploads with scanning on", () => {
  beforeEach(async () => {
    await resetDb();
    scan.fail = false;
    scan.result = { clean: true };
  });

  async function upload(name = "contract.pdf") {
    const { uploadDocument } = await import("@/server/documents/service");
    const staff = await makeUser("LEASING_STAFF");
    const admin = await makeUser("ADMIN");
    await makeProperty(admin);
    const tenant = await makeTenant(staff);
    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF");
    return {
      tenant,
      attempt: () =>
        uploadDocument(
          staff,
          { tenantId: tenant.id, category: "OTHER" },
          { name, bytes: pdf },
          meta,
        ),
    };
  }

  it("refuses an infected file, keeps nothing, and records it without the file name", async () => {
    scan.result = { clean: false, signature: "Eicar-Test-Signature" };
    const { tenant, attempt } = await upload("Secret Tenant ID.pdf");
    await expect(attempt()).rejects.toThrow(/Please check/);
    const { db } = await import("@/server/db");
    expect(await db.document.count()).toBe(0);
    expect(await auditActions(tenant.id)).toContain("document.virus_found");
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "document.virus_found" } });
    expect(JSON.stringify(row.metadata)).not.toContain("Secret Tenant");
  });

  it("refuses uploads while the scanner is down, instead of storing them unchecked", async () => {
    scan.fail = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { attempt } = await upload();
    await expect(attempt()).rejects.toThrow(/couldn't check this file for viruses/);
    error.mockRestore();
  });

  it("stores clean files", async () => {
    const { attempt } = await upload();
    expect((await attempt()).contentType).toBe("application/pdf");
  });
});
