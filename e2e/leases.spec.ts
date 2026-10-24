import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./fixtures";

/** Dates relative to today so the test stays valid on any day. */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fillTerms(page: Page, start: string, end: string, rent = "50,000") {
  await page.getByLabel("First day of the lease", { exact: true }).fill(start);
  await page.getByLabel("Last day of the lease", { exact: true }).fill(end);
  await page.getByLabel("Monthly rent", { exact: true }).fill(rent);
  await page.getByLabel("Rent due on day", { exact: true }).fill("5");
  await page.getByLabel("Security deposit", { exact: true }).fill("100,000");
}

test.describe.configure({ mode: "serial" });

test.describe("Phase 2 acceptance", () => {
  test("a lease is created in 4 clear steps, with a new tenant and the privacy notice", async ({
    page,
  }) => {
    await signInAs(page, "staff");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Leases" })
      .click();
    await page.getByRole("link", { name: "New lease" }).click();

    // Step 1: unit
    await expect(page.getByText("Step 1 of 4 · Unit")).toBeVisible();
    await page.getByRole("radio", { name: /Unit 501/ }).check();
    await page.getByRole("button", { name: "Next: Tenant" }).click();

    // Step 2: tenant (new, with privacy acknowledgement)
    await expect(page.getByText("Step 2 of 4 · Tenant")).toBeVisible();
    await page.getByRole("button", { name: "Add a new tenant" }).click();
    await page.getByLabel("Display name", { exact: true }).fill("Kalayaan Foods Corp.");
    await page.getByLabel("Contact person", { exact: true }).fill("Jose Ramos");
    await page.getByRole("button", { name: "Add tenant and continue" }).click();
    await expect(
      page.getByText("Please confirm the tenant has received the privacy notice."),
    ).toBeVisible();
    await page
      .getByLabel("The tenant has received and acknowledged the privacy notice.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Add tenant and continue" }).click();

    // Step 3: terms, with duration calculated
    await expect(page.getByText("Step 3 of 4 · Terms")).toBeVisible();
    await page.getByRole("button", { name: "Next: Review and save" }).click();
    await expect(page.getByText("Enter the start date.")).toBeVisible();
    await fillTerms(page, "2026-01-01", "2027-12-31");
    await expect(page.getByText("2 years, 0 months")).toBeVisible();
    await page.getByRole("button", { name: "Next: Review and save" }).click();

    // Step 4: plain-language review, then save
    await expect(page.getByText("Step 4 of 4 · Review and save")).toBeVisible();
    await expect(
      page.getByText("Rent is ₱50,000.00 a month, due on the 5th of each month."),
    ).toBeVisible();
    await expect(page.getByText(/We will email the Leasing team on/)).toBeVisible();
    await page.getByRole("button", { name: "Save lease" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Kalayaan Foods Corp." }),
    ).toBeVisible();
    await expect(page.getByText(/LSE-\d{4}-0001 · Unit 501, E2E Tower/)).toBeVisible();
  });

  test("an overlapping lease on the same unit is blocked with a clear message", async ({
    page,
  }) => {
    await signInAs(page, "staff");
    await page.goto("/leases/new");
    const restored = page.getByRole("button", { name: "Start over" });
    if (await restored.isVisible()) await restored.click();
    await page
      .getByLabel("Also show units that are occupied or unavailable", { exact: true })
      .click();
    await page.getByRole("radio", { name: /Unit 501/ }).check();
    await page.getByRole("button", { name: "Next: Tenant" }).click();
    await page.getByLabel("Search tenants", { exact: true }).fill("abc corp");
    await page.getByRole("radio", { name: /ABC Corporation/ }).check();
    await page.getByRole("button", { name: "Next: Terms" }).click();
    await fillTerms(page, "2027-06-01", "2028-05-31");
    await page.getByRole("button", { name: "Next: Review and save" }).click();
    await page.getByRole("button", { name: "Save lease" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Unit 501 is already leased to Kalayaan Foods Corp." }),
    ).toBeVisible();
    // Sent back to the dates.
    await expect(page.getByText("Step 3 of 4 · Terms")).toBeVisible();
  });

  test("a draft survives leaving the wizard", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases/new");
    const restored = page.getByRole("button", { name: "Start over" });
    if (await restored.isVisible()) await restored.click();
    await page.getByRole("radio", { name: /Unit 502/ }).check();
    await page.waitForTimeout(1800); // autosave runs after a short pause
    await page.goto("/units");
    await page.goto("/leases/new");
    await expect(page.getByText(/We kept the lease you were working on/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /Unit 502/ })).toBeChecked();
    await page.getByRole("button", { name: "Start over" }).click();
  });

  test("renewal creates a linked lease and marks the old one Renewed", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases?q=kalayaan");
    await page.getByRole("link", { name: /LSE-/ }).first().click();
    await page.getByRole("link", { name: "Renew lease" }).click();
    await expect(page.getByLabel("First day of the lease", { exact: true })).toHaveValue(
      "2028-01-01",
    );
    await expect(page.getByLabel("Last day of the lease", { exact: true })).toHaveValue(
      "2029-12-31",
    );
    await page.getByLabel("Monthly rent", { exact: true }).fill("55,000");
    await page.getByRole("button", { name: "Next: review" }).click();
    await expect(
      page.getByText("Rent is ₱55,000.00 a month, due on the 5th of each month."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save renewal" }).click();

    await expect(page.getByText(/LSE-\d{4}-0002/).first()).toBeVisible();
    await page.getByRole("tab", { name: "History" }).click();
    const chain = page.getByRole("list").filter({ hasText: "(this lease)" });
    await expect(chain).toContainText("LSE-");
    await chain.getByRole("link").first().click();
    await expect(page.getByText("Renewed", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Renew lease" })).toHaveCount(0);
  });

  test("changing terms shows what will change, then records it", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases?q=abc");
    await page.goto("/leases/new");
    const restored = page.getByRole("button", { name: "Start over" });
    if (await restored.isVisible()) await restored.click();
    await page.getByRole("radio", { name: /Unit 503/ }).check();
    await page.getByRole("button", { name: "Next: Tenant" }).click();
    await page.getByLabel("Search tenants", { exact: true }).fill("abc");
    await page.getByRole("radio", { name: /ABC Corporation/ }).check();
    await page.getByRole("button", { name: "Next: Terms" }).click();
    await fillTerms(page, isoFromToday(-30), isoFromToday(700), "40000");
    await page.getByRole("button", { name: "Next: Review and save" }).click();
    await page.getByRole("button", { name: "Save lease" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "ABC Corporation" })).toBeVisible();

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Change dates, rent or terms" }).click();
    await page.getByLabel("Monthly rent", { exact: true }).fill("42,500");
    await page.getByRole("button", { name: "Review 1 change" }).click();
    await expect(page.getByText("₱42,500.00")).toBeVisible();
    await page.getByRole("button", { name: "Save 1 change" }).click();
    await expect(page.getByText("Rent is ₱42,500.00 a month")).toBeVisible();
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText("monthly rent: ₱40,000.00 → ₱42,500.00")).toBeVisible();
  });

  test("ending a lease early needs a date and a reason", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases?q=503");
    await page.getByRole("link", { name: /LSE-/ }).first().click();
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "End lease early" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "End lease early" }).click();
    await expect(dialog.getByText("Please describe the reason in a few words.")).toBeVisible();
    await dialog.getByLabel("Reason", { exact: true }).fill("Tenant moved to a bigger unit");
    await dialog.getByRole("button", { name: "End lease early" }).click();
    await expect(page.getByText("Terminated", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Ended early on/).first()).toBeVisible();
  });

  test("forgiving search finds 'abc corp' when the record says 'ABC Corporation'", async ({
    page,
  }) => {
    await signInAs(page, "staff");
    await page.goto("/tenants");
    await page.getByLabel("Search", { exact: true }).fill("abc corp");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("link", { name: "ABC Corporation" })).toBeVisible();
  });

  test("Viewers see units and tenant names only, and can't open leases or tenants", async ({
    page,
  }) => {
    await signInAs(page, "viewer");
    await page.goto("/units");
    await expect(page.getByRole("cell", { name: "Kalayaan Foods Corp." })).toBeVisible();
    await expect(page.getByRole("link", { name: /LSE-/ })).toHaveCount(0);
    await page.getByRole("link", { name: "501" }).click();
    await expect(page.getByText("Kalayaan Foods Corp.").first()).toBeVisible();
    await expect(page.getByText(/₱/)).toHaveCount(0);
    await expect(page.getByText("maria@abc.example")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /LSE-/ })).toHaveCount(0);
    for (const path of [
      "/leases",
      "/leases/new",
      "/tenants",
      "/tenants/new",
      "/settings/buildings",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/no-access$/);
    }
  });

  test("Admins add buildings and units in Settings", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/settings/buildings");
    await page.getByRole("button", { name: "Add building" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Building name", { exact: true }).fill("Harbour Point");
    await dialog.getByLabel("Short code", { exact: true }).fill("hbr");
    await dialog.getByLabel("Address", { exact: true }).fill("88 Roxas Boulevard, Pasay");
    await dialog.getByRole("button", { name: "Add building" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Harbour Point" })).toBeVisible();
    await page.getByRole("button", { name: "Add unit" }).first().click();
    await page.getByRole("dialog").getByLabel("Unit number or name", { exact: true }).fill("G-1");
    await page.getByRole("dialog").getByRole("button", { name: "Add unit" }).click();
    await expect(page.getByText("Unit G-1 added ✓")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("link", { name: "G-1", exact: true })).toBeVisible();
  });
});
