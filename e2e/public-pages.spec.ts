import { expect, test } from "@playwright/test";

/**
 * The pages the payment partner checks before turning on live payments: reachable without signing
 * in, linked from the sign-in page, and the prices come from the plan configuration.
 */
const PAGES: [string, string][] = [
  ["/pricing", "Simple monthly plans"],
  ["/legal/terms", "Terms of Service"],
  ["/legal/privacy", "Privacy Policy"],
  ["/legal/dpa", "Data Processing Agreement"],
  ["/legal/refunds", "Refunds and cancellation"],
  ["/contact", "Contact us"],
  ["/welcome", "Never miss a lease renewal again."],
  ["/product", "Every lease, every peso, every date. In one place."],
  ["/customers", "Lessors who stopped chasing dates"],
  ["/help", "How can we help?"],
  ["/about", "We built the lease ledger we wished we had"],
  ["/security", "Your tenants trust you. You can trust Propfolio."],
];

for (const [path, heading] of PAGES) {
  test(`${path} is public`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}

test("the sign-in page links to every public page", async ({ page }) => {
  await page.goto("/login");
  const footer = page.getByRole("navigation", { name: "About Propfolio" });
  for (const label of [
    "Pricing",
    "Terms of Service",
    "Privacy Policy",
    "Data Processing Agreement",
    "Refunds and cancellation",
    "Contact",
  ]) {
    await expect(footer.getByRole("link", { name: label })).toBeVisible();
  }
});

test("pricing shows the configured prices and leads to sign-up", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("₱1,500.00").first()).toBeVisible();
  await expect(page.getByText("₱3,500.00").first()).toBeVisible();
  await page.getByRole("link", { name: "Start free" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Start free" })).toBeVisible();
});
