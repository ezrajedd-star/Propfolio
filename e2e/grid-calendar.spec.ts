import { expect, test } from "@playwright/test";

import { signInAs } from "./fixtures";

test.describe.configure({ mode: "serial" });

function thisMonthDay(day: number): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

test.describe("Phase 3 acceptance", () => {
  test("an edit in the grid shows on the calendar without a page reload", async ({ page }) => {
    await signInAs(page, "staff");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Leases" })
      .click();
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("dialog").getByRole("checkbox", { name: "Rent due day" }).check();
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

    // Edit in place; a bad value is explained, a good one saves.
    const cell = page.getByRole("button", { name: /Edit rent due day for LSE-E2E-0001/ });
    await cell.click();
    const input = page.getByLabel("Edit rent due day for LSE-E2E-0001");
    await input.fill("31");
    await input.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "1 to 28" })).toBeVisible();
    await input.fill("17");
    await input.press("Enter");
    await expect(page.getByText("Saved ✓")).toBeVisible();

    // Mark the page, then move to the calendar with the sidebar (client-side navigation).
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Calendar" })
      .click();
    await page.getByRole("checkbox", { name: "Rent due" }).check();
    const day17 = page.locator(`td[data-date="${thisMonthDay(17)}"]`);
    await expect(day17.getByText(/Rent due: Calendar Test Co/)).toBeVisible();
    await expect(
      page.locator(`td[data-date="${thisMonthDay(5)}"]`).getByText(/Rent due: Calendar Test Co/),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
    ).toBe(true);

    // The side panel shows the lease and links to it.
    await day17.getByText(/Rent due: Calendar Test Co/).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("LSE-E2E-0001")).toBeVisible();
    await expect(panel.getByText("₱65,000.00")).toBeVisible();
    await panel.getByRole("link", { name: "Open lease" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Calendar Test Co" })).toBeVisible();
  });

  test("undo puts the old value back", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases?q=calendar");
    const cell = page.getByRole("button", { name: /Edit remarks for LSE-E2E-0001/ });
    await cell.click();
    await page.getByLabel("Edit remarks for LSE-E2E-0001").fill("Call before visiting");
    await page.getByLabel("Edit remarks for LSE-E2E-0001").press("Enter");
    await expect(
      page.getByRole("button", { name: /^Call before visiting\. Edit remarks/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Change undone")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: /^Empty\. Edit remarks for LSE-E2E-0001/ }),
    ).toBeVisible();
  });

  test("forgiving search, saved column layout and export", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases");
    await page.getByLabel("Search").fill("cal test");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("link", { name: "LSE-E2E-0001" })).toBeVisible();

    // Hide a column; the choice survives a reload.
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("dialog").getByRole("checkbox", { name: "Remarks" }).uncheck();
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("columnheader", { name: /Remarks/ })).toHaveCount(0);
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByRole("columnheader", { name: /Remarks/ })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /Rent due day/ })).toBeVisible();

    // Export the current view to Excel.
    await page.getByRole("button", { name: "Export" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^propfolio-leases-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test("Viewers see start and end dates only, with no lease details", async ({ page }) => {
    await signInAs(page, "viewer");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Calendar" })
      .click();
    await expect(page.getByRole("checkbox", { name: "Rent due" })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Reminder" })).toHaveCount(0);
    await page.getByRole("button", { name: "List" }).click();
    await page.getByRole("button", { name: "Previous" }).click();
    await page.getByRole("button", { name: "Previous" }).click();
    const start = page.getByText(/Starts: Calendar Test Co/);
    await expect(start).toBeVisible();
    await start.click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Unit 601, E2E Tower")).toBeVisible();
    await expect(panel.getByRole("link", { name: "Open lease" })).toHaveCount(0);
    await expect(panel.getByText(/₱|LSE-/)).toHaveCount(0);
    const api = await page.request.get(
      "/api/v1/calendar?from=2020-01-01&to=2020-12-31&types=RENT_DUE,REMINDER",
    );
    expect((await api.json()).events).toEqual([]);
  });
});
