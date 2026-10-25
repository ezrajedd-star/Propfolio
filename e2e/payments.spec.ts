import { expect, test } from "@playwright/test";

import { signInAs } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.describe("Phase 5: payments", () => {
  test("the overdue list, Home and the grid all show the same overdue amount", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/payments");
    const row = page.locator("#overdue").getByRole("row", { name: /Overdue Trading Inc\./ });
    await expect(row).toContainText("₱80,000.00");
    await expect(row).toContainText("31–60 days");

    await page.goto("/leases?overdue=1");
    await expect(page.getByRole("link", { name: "LSE-E2E-0002" })).toBeVisible();
    await expect(page.getByRole("link", { name: "LSE-E2E-0001" })).toHaveCount(0);

    await page.goto("/");
    await expect(page.getByText("₱80,000.00 overdue")).toBeVisible();
  });

  test("record a payment: oldest charges first, then a printable acknowledgement", async ({
    page,
  }) => {
    await signInAs(page, "staff");
    await page.goto("/payments");
    await page.getByRole("link", { name: "Record payment for Overdue Trading Inc." }).click();
    await expect(page.getByRole("heading", { name: "Record a payment" })).toBeVisible();
    await expect(page.getByText("Rent, month 1")).toBeVisible();

    await page.getByLabel("Amount received", { exact: true }).fill("50,000");
    await expect(page.getByText(/₱50,000\.00 goes to 2 charges/)).toBeVisible();
    await page.getByLabel("Reference", { exact: true }).fill("BT-0001");
    await page.getByRole("button", { name: "Record payment" }).click();

    await expect(page.getByText("Acknowledgement — not an official receipt")).toBeVisible();
    await expect(page.getByText("₱50,000.00").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();

    await page.getByRole("link", { name: "LSE-E2E-0002" }).click();
    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByText("₱30,000.00").first()).toBeVisible();
    await expect(page.getByText("Overdue (part paid)")).toBeVisible();
  });

  test("voiding a payment needs a reason and makes the charges unpaid again", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases?q=overdue");
    await page.getByRole("link", { name: "LSE-E2E-0002" }).click();
    await page.getByRole("tab", { name: "Payments" }).click();
    await page.getByRole("button", { name: /^Void payment PAY-/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Void payment" }).click();
    await expect(dialog.getByText("Please give the reason in a few words.")).toBeVisible();
    await dialog.getByLabel("Reason").fill("Entered against the wrong lease");
    await dialog.getByRole("button", { name: "Void payment" }).click();
    await expect(page.getByText("Payment voided")).toBeVisible();
    await expect(page.getByText("Reason: Entered against the wrong lease")).toBeVisible();

    await page.goto("/payments");
    await expect(
      page.locator("#overdue").getByRole("row", { name: /Overdue Trading Inc\./ }),
    ).toContainText("₱80,000.00");
  });

  test("Viewers can't open Payments", async ({ page }) => {
    await signInAs(page, "viewer");
    await page.goto("/payments");
    await expect(page).toHaveURL(/\/no-access/);
  });
});
