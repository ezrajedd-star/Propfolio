import { expect, test } from "@playwright/test";

import { signInAs } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.describe("Phase 4: reminders", () => {
  test("Mark as handled stops reminders, shows in the grid, and can be undone", async ({
    page,
  }) => {
    await signInAs(page, "staff");
    await page.goto("/leases?q=calendar");
    await page.getByRole("link", { name: "LSE-E2E-0001" }).click();
    await page.getByRole("tab", { name: "Reminders" }).click();
    await expect(page.getByText(/Already dealing with this renewal or move-out/)).toBeVisible();

    await page.getByRole("button", { name: "Mark reminder handled" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("What was decided? (optional)")
      .fill("Tenant confirmed renewal by phone");
    await dialog.getByRole("button", { name: "Mark as handled" }).click();
    await expect(
      page.getByText(/Marked as handled ✓ No more reminders about Calendar Test Co/),
    ).toBeVisible();
    await expect(page.getByText("Marked as handled — no more reminders")).toBeVisible();
    await expect(page.getByText("“Tenant confirmed renewal by phone”")).toBeVisible();

    await page.goto("/leases?q=calendar");
    await expect(page.getByRole("row", { name: /LSE-E2E-0001/ })).toContainText("Handled");

    await page.getByRole("link", { name: "LSE-E2E-0001" }).click();
    await page.getByRole("tab", { name: "Reminders" }).click();
    await page.getByRole("button", { name: "Turn reminders back on" }).click();
    await expect(page.getByText("Reminders turned back on")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark reminder handled" })).toBeVisible();

    const history = page.getByRole("tab", { name: "History" });
    await history.click();
    await expect(page.getByText("Marked reminder handled").first()).toBeVisible();
  });

  test("Admins see who receives reminder emails — never Property Management", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/settings");
    // Every settings section is linked from the index.
    for (const name of [
      "Users",
      "General",
      "Audit log",
      "Buildings and units",
      "Unit types and reminders",
      "Reminder emails",
      "Privacy",
    ]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await page.getByRole("link", { name: /Reminder emails/ }).click();
    const who = page
      .getByRole("heading", { name: "Who receives them" })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await expect(who).toContainText("Ada Admin");
    await expect(who).toContainText("Sam Staff");
    await expect(who).not.toContainText("Vic Viewer");
    await expect(page.getByRole("switch", { name: /overdue payments/ })).toBeChecked();
  });

  test("Leasing Staff can't open the reminder email settings", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/settings/reminder-emails");
    await expect(page).toHaveURL(/\/no-access$/);
  });
});
