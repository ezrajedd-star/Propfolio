import { expect, test, type Page } from "@playwright/test";

/** The website on a phone: every page fits the screen, and the menu works. */
const PAGES = [
  "/",
  "/product",
  "/pricing",
  "/customers",
  "/help",
  "/about",
  "/security",
  "/contact",
  "/legal/terms",
  "/for/residential",
  "/compare/excel",
  "/resources",
  "/resources/rent-escalation-explained",
  "/whats-new",
  "/status",
  "/partners",
];

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${page.url()} scrolls sideways`).toBeLessThanOrEqual(1);
}

for (const path of PAGES) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noSidewaysScroll(page);
  });
}

test("the phone menu opens and leads to a page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Start free" })).toBeVisible();
  await dialog.getByRole("link", { name: "Pricing" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Simple monthly plans" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
