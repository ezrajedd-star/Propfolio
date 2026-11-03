import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_ACCOUNT_ID, USERS, signInAs } from "./fixtures";

/**
 * Two customer accounts, checked from the outside: the Owner of "Other Leasing Inc." is signed in
 * and tries every page and API address with the main e2e account's ids, then every list,
 * export and report. Nothing of the main account may come back.
 */
test.describe.configure({ mode: "serial" });

// Words that only appear in the main account's data.
const MAIN_MARKERS = [
  "Overdue Trading",
  "Calendar Test Co",
  "ABC Corporation",
  "E2E Tower",
  "E2E Leasing Co",
  "Ada Admin",
  "admin@e2e.test",
  "LSE-E2E",
  "PAY-E2E-SEP",
  "Paolo Cruz",
];

interface MainIds {
  lease: string;
  tenant: string;
  unit: string;
  building: string;
  document: string;
  payment: string;
  user: string;
}

const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
let ids: MainIds;

test.beforeAll(async () => {
  const lease = await db.lease.findFirstOrThrow({
    where: { refNo: "LSE-E2E-0002" },
    include: { unit: true },
  });
  const document = await db.document.findFirstOrThrow({ where: { leaseId: lease.id } });
  const user = await db.user.findUniqueOrThrow({ where: { email: USERS.admin.email } });
  const payment = await db.payment.create({
    data: {
      accountId: E2E_ACCOUNT_ID,
      paymentNo: "PAY-E2E-SEP",
      leaseId: lease.id,
      receivedDate: new Date("2026-01-05"),
      amount: "100",
      method: "CASH",
    },
  });
  ids = {
    lease: lease.id,
    tenant: lease.tenantId,
    unit: lease.unitId,
    building: lease.unit.buildingId,
    document: document.id,
    payment: payment.id,
    user: user.id,
  };
});

test.afterAll(async () => {
  await db.payment.deleteMany({ where: { paymentNo: "PAY-E2E-SEP" } });
  await db.$disconnect();
});

function expectNoMainData(text: string, where: string) {
  for (const marker of MAIN_MARKERS)
    expect(text, `${where} shows "${marker}"`).not.toContain(marker);
}

async function getText(request: APIRequestContext, path: string) {
  const r = await request.get(path);
  return { status: r.status(), text: await r.text() };
}

test("another account's pages say 'not found' and show none of its data", async ({ page }) => {
  await signInAs(page, "other");
  const paths = [
    `/leases/${ids.lease}`,
    `/leases/${ids.lease}/edit`,
    `/leases/${ids.lease}/renew`,
    `/tenants/${ids.tenant}`,
    `/units/${ids.unit}`,
    `/payments/${ids.payment}`,
    `/settings/buildings/${ids.building}`,
  ];
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that" }), path).toBeVisible();
    expectNoMainData(await page.content(), path);
  }
  // Forms that take an id from the address don't pick up the other account's record.
  for (const path of [`/payments/new?leaseId=${ids.lease}`, `/leases/new?unitId=${ids.unit}`]) {
    const response = await page.goto(path);
    expect(response?.status() ?? 500, path).toBeLessThan(500);
    expectNoMainData(await page.content(), path);
  }
});

test("another account's records can't be fetched or changed through the API", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "other");
  const request = page.request;
  for (const path of [
    `/api/v1/documents/${ids.document}/link`,
    `/api/v1/tenants/${ids.tenant}/privacy-export`,
    `/api/v1/users/${ids.user}`,
    `/api/v1/files/e2e-separation-check?e=9999999999&s=forged`,
  ]) {
    const { status, text } = await getText(request, path);
    expect(status, path).toBe(404);
    expectNoMainData(text, path);
  }

  const patch = await request.patch(`/api/v1/users/${ids.user}`, {
    headers: { Origin: baseURL! },
    data: { name: "Hijacked" },
  });
  expect(patch.status()).toBe(404);

  const upload = await request.post("/api/v1/documents", {
    headers: { Origin: baseURL! },
    multipart: {
      leaseId: ids.lease,
      category: "OTHER",
      file: {
        name: "planted.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\n%%EOF"),
      },
    },
  });
  expect(upload.status()).toBe(404);

  // Nothing changed in the main account.
  expect((await db.user.findUniqueOrThrow({ where: { id: ids.user } })).name).toBe(
    USERS.admin.name,
  );
  expect(await db.document.count({ where: { fileName: "planted.pdf" } })).toBe(0);
});

test("lists, exports, reports and the calendar show only the account's own data", async ({
  page,
}) => {
  await signInAs(page, "other");
  for (const path of [
    "/",
    "/leases",
    "/tenants",
    "/units",
    "/payments",
    "/calendar",
    "/reports/rent-roll",
    "/reports/expiry",
    "/settings/users",
    "/settings/buildings",
    "/settings/audit-log",
    "/settings/feedback",
    "/settings/general",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expectNoMainData(await page.content(), path);
  }

  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10);
  for (const path of [
    `/api/v1/calendar?from=${today}&to=${nextYear}`,
    "/api/v1/audit-log",
    "/api/v1/users",
    "/api/v1/me",
    "/api/v1/leases/export?format=csv",
    "/api/v1/payments/overdue/export?format=csv",
    "/api/v1/reports/rent-roll/export?format=csv",
    "/api/v1/reports/expiry/export?format=csv&days=365",
    "/api/v1/reports/collections/export?format=csv",
    "/api/v1/feedback/export",
  ]) {
    const { status, text } = await getText(page.request, path);
    expect(status, path).toBe(200);
    expectNoMainData(text, path);
  }
  // Its own data is there.
  await page.goto("/tenants");
  await expect(page.getByText("Other Account Tenant")).toBeVisible();
});
