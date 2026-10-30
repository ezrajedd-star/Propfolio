import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { signInAs, USERS } from "./fixtures";

test.describe.configure({ mode: "serial" });

async function forgetTaskTours(email: string) {
  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await db.userPreference.update({
    where: { userId_key: { userId: user.id, key: "guide" } },
    data: { value: { tourDone: true, on: false, toursDone: [] } },
  });
  await db.$disconnect();
}

test.describe("Task tours, adding units, not-found pages", () => {
  test("the Add-a-lease tour starts the first time, only once, and replays on request", async ({
    page,
  }) => {
    await forgetTaskTours(USERS.staff.email);
    await signInAs(page, "staff");
    await page.goto("/leases/new");
    const tour = page.getByRole("dialog");
    await expect(tour.getByRole("heading", { name: "Adding a lease" })).toBeVisible();
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour.getByRole("heading", { name: "Four steps" })).toBeVisible();
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour.getByRole("heading", { name: "Find the unit" })).toBeVisible();
    await tour.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "New lease" })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Show me how" }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Adding a lease" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Other pages have their own tour.
    await page.goto("/tenants/new");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Company or person?" }),
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Skip tour" }).click();
    await page.goto("/reports");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Six ready-made reports" }),
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Skip tour" }).click();
  });

  test("Admins add many units at once; existing numbers are skipped", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/units");
    await page.getByRole("link", { name: "Add a building or units" }).click();
    await page.getByRole("link", { name: "E2E Tower" }).click();
    await page.getByRole("button", { name: "Add several units" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Unit numbers").fill("120-101");
    await expect(dialog.getByText("the range goes backwards")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add units" })).toBeDisabled();
    await dialog.getByLabel("Unit numbers").fill("501\n801 to 805");
    await expect(dialog.getByText("6 units:")).toBeVisible();
    await dialog.getByRole("button", { name: "Add 6 units" }).click();
    await expect(
      page.getByText("5 units added ✓ · 1 already existed and were skipped"),
    ).toBeVisible();
    for (const n of ["801", "803", "805"]) {
      await expect(page.getByRole("link", { name: n, exact: true })).toBeVisible();
    }
  });

  test("Leasing Staff are told who can add units", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/units");
    await expect(page.getByText("New building or units? Ask an Admin to add them.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a building or units" })).toHaveCount(0);
  });

  test("unknown or malformed addresses show a friendly 'not found'", async ({ page }) => {
    await signInAs(page, "staff");
    for (const path of [
      "/leases/0195f3a2-7b1c-7d00-9e00-00000a3f9a21",
      "/leases/not-a-real-id",
      "/tenants/0195f3a2-7b1c-7d00-9e00-00000a3f9a21",
      "/payments/0195f3a2-7b1c-7d00-9e00-00000a3f9a21",
      "/units/1%20OR%201%3D1",
      "/leases/0195f3a2-7b1c-7d00-9e00-00000a3f9a21/edit",
    ]) {
      const r = await page.goto(path);
      expect(r?.status(), path).toBe(404);
      await expect(
        page.getByRole("heading", { name: "We couldn't find that" }),
        path,
      ).toBeVisible();
    }
  });
});
