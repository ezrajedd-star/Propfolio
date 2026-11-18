import { createHmac } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_APP_SECRET, E2E_DATABASE_URL } from "../playwright.config";

/** An Owner downloads all their data, then closes the account; the reopen page explains itself. */
const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
const EMAIL = `closing.${Date.now()}@walkthrough.example`;

test.afterAll(async () => {
  await db.$disconnect();
});

test("download everything, then close the account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Cora Closer");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("a long sunny afternoon");
  await page.getByLabel("The name you lease under").fill("Cora Leasing");
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cora");

  await page.goto("/settings");
  await page.getByRole("link", { name: /Your data/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download all data (Excel)" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^Cora Leasing - all data \d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  await page.getByRole("button", { name: "Close this account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type Cora Leasing to confirm").fill("Cora");
  await dialog.getByRole("button", { name: "Close the account" }).click();
  await expect(dialog.getByText(/Type the name exactly as shown/)).toBeVisible();
  await dialog.getByLabel("Type Cora Leasing to confirm").fill("cora leasing");
  await dialog.getByRole("button", { name: "Close the account" }).click();

  await expect(page).toHaveURL(/\/login\?reason=account-closed/);
  await expect(page.getByText(/Your account is closed/)).toBeVisible();
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("a long sunny afternoon");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/This Propfolio account has been closed/)).toBeVisible();
});

test("an old or wrong reopen link says so plainly", async ({ page }) => {
  await page.goto("/reopen-account/not-a-real-link");
  await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
});
