import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { OTHER_ACCOUNT_ID, signInAs } from "./fixtures";

/**
 * Plans, from the outside: the second customer ("Other Leasing Inc.") is put on Free. Locked
 * features stay in the menu with a lock, open the "Available on …" screen, and refuse their APIs.
 */
test.describe.configure({ mode: "serial" });

const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });

test.beforeAll(async () => {
  await db.account.update({
    where: { id: OTHER_ACCOUNT_ID },
    data: { plan: "FREE", trialEndsAt: null, paidUntil: null },
  });
});

test.afterAll(async () => {
  await db.account.update({
    where: { id: OTHER_ACCOUNT_ID },
    data: { plan: "PREMIUM", trialEndsAt: null, paidUntil: null },
  });
  await db.$disconnect();
});

test("Free: locked features show a lock and explain what upgrading adds", async ({ page }) => {
  await signInAs(page, "other");
  const menu = page.getByRole("navigation", { name: "Main" }).first();
  await expect(menu.getByRole("link", { name: /Payments.*Available on Pro/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /Reports.*Available on Pro/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /^Leases$/ })).toBeVisible();

  await menu.getByRole("link", { name: /Payments/ }).click();
  await expect(page).toHaveURL(/\/plan\/locked\?feature=payments/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("available on Pro");
  await page.getByRole("link", { name: "Upgrade" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Plan" })).toBeVisible();
  await expect(page.getByText("Your account is on the Free plan.")).toBeVisible();
  await expect(page.getByText("Your plan", { exact: true })).toBeVisible();
  await expect(page.getByText("₱3,500.00")).toBeVisible();
});

test("Free: the server refuses paid features, whatever the page shows", async ({ page }) => {
  await signInAs(page, "other");
  const audit = await page.request.get("/api/v1/audit-log");
  expect(audit.status()).toBe(403);
  expect((await audit.json()).error.code).toBe("PLAN_LIMIT");
  await page.goto("/settings/users");
  await expect(page).toHaveURL(/\/plan\/locked\?feature=team/);
});
