import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const documentLink = vi.fn<() => Promise<string>>();

vi.mock("@/server/auth/current", () => ({ requireActor: vi.fn(async () => ({ id: "actor" })) }));
vi.mock("@/server/documents/service", () => ({ documentLink: () => documentLink() }));
vi.mock("@/server/env", () => ({ env: () => ({ APP_URL: "https://leases.example.com" }) }));
vi.mock("@/server/http", () => ({
  apiRoute:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest, ctx: unknown) =>
      handler(req, ctx),
}));

const { GET } = await import("./route");

// Behind the reverse proxy, the app sees the request at its internal address.
const internalRequest = () =>
  new NextRequest("http://0.0.0.0:3000/api/v1/documents/doc-1/link", {
    headers: { "x-forwarded-for": "203.0.113.5" },
  });
const ctx = { params: Promise.resolve({ id: "doc-1" }) };

describe("GET /api/v1/documents/[id]/link", () => {
  beforeEach(() => documentLink.mockReset());

  it.each([
    [
      "a local signed link goes to the public address, not the internal one",
      "/api/v1/files/abc?e=1&s=sig",
      "https://leases.example.com/api/v1/files/abc?e=1&s=sig",
    ],
    [
      "an S3 signed link is kept as it is",
      "https://bucket.s3.amazonaws.com/abc?X-Amz-Signature=sig",
      "https://bucket.s3.amazonaws.com/abc?X-Amz-Signature=sig",
    ],
  ])("%s", async (_name, signed, expected) => {
    documentLink.mockResolvedValue(signed);
    const res = await GET(internalRequest(), ctx);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(expected);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
