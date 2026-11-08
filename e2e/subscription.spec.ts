import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { OTHER_ACCOUNT_ID, signInAs } from "./fixtures";

/**
 * Paying for a plan, from the outside, with the demo provider (no real money): the second
 * customer's Owner chooses Premium, pays on the test checkout, sees the payment record, and
 * cancels. The account is put back as it was afterwards.
 */
test.describe.configure({ mode: "serial" });

const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });

test.afterAll(async () => {
  await db.subscriptionInvoice.deleteMany({ where: { accountId: OTHER_ACCOUNT_ID } });
  await db.checkout.deleteMany({ where: { accountId: OTHER_ACCOUNT_ID } });
  await db.subscription.deleteMany({ where: { accountId: OTHER_ACCOUNT_ID } });
  await db.account.update({
    where: { id: OTHER_ACCOUNT_ID },
    data: { plan: "PREMIUM", trialEndsAt: null, paidUntil: null },
  });
  await db.$disconnect();
});

test("the Owner pays for Premium on the checkout, then cancels", async ({ page }) => {
  await signInAs(page, "other");
  await page.goto("/plan");
  await page.getByRole("button", { name: "Choose Premium" }).click();

  await expect(page.getByText("Test payment: no real money moves.")).toBeVisible();
  await expect(page.getByText("₱3,500.00")).toBeVisible();
  await page.getByRole("button", { name: "Pay with GCash (test)" }).click();

  await expect(page.getByText("Payment received ✓")).toBeVisible();
  await expect(page.getByText(/Paid until .* Next charge: ₱3,500.00/)).toBeVisible();
  await expect(page.getByRole("cell", { name: /^PF-\d{4}-\d{6}$/ })).toBeVisible();

  await page.getByRole("button", { name: "Cancel my plan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel my plan" }).click();
  await expect(page.getByText(/Cancelled: you keep Premium until/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep this plan" })).toBeVisible();
});

test("only the Owner sees the subscription; others can't open the checkout", async ({ page }) => {
  await signInAs(page, "staff");
  await page.goto("/plan");
  await expect(page.getByRole("button", { name: /Choose|Upgrade/ })).toHaveCount(0);
  await expect(page.getByText("Only your account's Owner can change the plan.")).toBeVisible();
});
