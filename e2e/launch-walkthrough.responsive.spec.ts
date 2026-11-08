import { createHmac } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

import { E2E_APP_SECRET, E2E_DATABASE_URL } from "../playwright.config";
import { IMPORT_COLUMNS, IMPORT_SHEETS } from "../src/domain/import/rows";

/**
 * The launch brief's phone walk-through, on a Pixel 7: sign up, import from Excel, the trial,
 * upgrade, downgrade, cancel. No page may scroll sideways. (The demo checkout stands in for the
 * payment partner; the email code is set in the database, as the e2e server only logs emails.)
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
const EMAIL = `phone.${Date.now()}@walkthrough.example`;

test.afterAll(async () => {
  await db.$disconnect();
});

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${page.url()} scrolls sideways`).toBeLessThanOrEqual(1);
}

async function importFile(): Promise<Buffer> {
  const rows: Record<(typeof IMPORT_SHEETS)[number], (string | number)[][]> = {
    Buildings: [["PH1", "Phone Plaza", "1 Mobile St, Pasig", "Commercial"]],
    Units: [
      ["PH1", "101", "Office"],
      ["PH1", "102", "Office"],
    ],
    Tenants: [["Walkthrough Foods", "Company", "Ana", "", "", "", "", "Signed form"]],
    Leases: [
      ["PH1", "101", "Walkthrough Foods", "2026-01-01", "2027-12-31", 30000, 5, 60000, 1, 5, 12],
    ],
  };
  const wb = new ExcelJS.Workbook();
  for (const s of IMPORT_SHEETS) {
    const ws = wb.addWorksheet(s);
    ws.addRow(IMPORT_COLUMNS[s]);
    for (const r of rows[s]) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("sign up, import, trial, upgrade, downgrade and cancel on a phone", async ({ page }) => {
  // 1. Sign up.
  await page.goto("/signup");
  await noSidewaysScroll(page);
  await page.getByLabel("Your name").fill("Pia Phone");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("a long sunny afternoon");
  await page.getByLabel("The name you lease under").fill("Phone Leasing");
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Start free" }).click();
  await expect(page.getByText(/We sent a 6-digit code/)).toBeVisible();
  const pending = await db.pendingSignUp.findFirstOrThrow({ where: { email: EMAIL } });
  await db.pendingSignUp.update({
    where: { id: pending.id },
    data: {
      codeHash: createHmac("sha256", E2E_APP_SECRET)
        .update(`signup:${pending.id}:123456`)
        .digest("hex"),
    },
  });
  await page.getByLabel("Code").fill("123456");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pia");
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await noSidewaysScroll(page);

  // 2. Import from Excel.
  await page.goto("/settings/import");
  await noSidewaysScroll(page);
  await page.locator("#import-file").setInputFiles({
    name: "My units.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await importFile(),
  });
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText(/Every row is fine/)).toBeVisible();
  await page.getByRole("button", { name: "Import now" }).click();
  await expect(page.getByText("Imported", { exact: true })).toBeVisible();

  // 3. The trial.
  await page.goto("/plan");
  await expect(page.getByText(/free Premium trial: \d+ days left/)).toBeVisible();
  await noSidewaysScroll(page);

  // 4. Choose Pro, then upgrade to Premium in the same month.
  await page.getByRole("button", { name: "Choose Pro" }).click();
  await expect(page.getByText("₱1,500.00")).toBeVisible();
  await noSidewaysScroll(page);
  await page.getByRole("button", { name: "Pay with a test card", exact: true }).click();
  await expect(page.getByText("Payment received ✓")).toBeVisible();
  await page.getByRole("button", { name: "Upgrade now" }).click();
  await page.getByRole("button", { name: "Pay with Maya (test)" }).click();
  await expect(page.getByText("Payment received ✓")).toBeVisible();
  await expect(page.getByText("Your account is on the Premium plan.")).toBeVisible();

  // 5. Downgrade from next month.
  await page.getByRole("button", { name: "Switch at the end of the month" }).click();
  await expect(page.getByText(/your plan will be Pro/)).toBeVisible();

  // 6. Cancel.
  await page.getByRole("button", { name: "Cancel my plan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel my plan" }).click();
  await expect(page.getByText(/Cancelled: you keep Premium until/)).toBeVisible();
  await expect(page.getByRole("cell", { name: /^PF-\d{4}-\d{6}$/ })).toHaveCount(2);
  await noSidewaysScroll(page);
});
