import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./fixtures";

/**
 * Automated accessibility check (axe-core, WCAG 2.1 A and AA) on every main screen. Automated
 * checks find about a third of problems; the rest needs a person with a screen reader and a
 * keyboard (see docs/accessibility.md).
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function check(page: Page, label: string) {
  // Let entrance animations finish so colours are measured as people see them.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = r.violations.map(
    (v) =>
      `${label}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}×) e.g. ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(problems, problems.join("\n")).toEqual([]);
}

const PUBLIC = [
  "/",
  "/product",
  "/pricing",
  "/customers",
  "/help",
  "/about",
  "/security",
  "/contact",
  "/partners",
  "/resources",
  "/resources/lease-renewal-checklist",
  "/compare/excel",
  "/for/residential",
  "/whats-new",
  "/status",
  "/legal/terms",
  "/login",
  "/signup",
  "/forgot-password",
];

for (const path of PUBLIC) {
  test(`website ${path}`, async ({ page }) => {
    await page.goto(path);
    await check(page, path);
  });
}

const APP = [
  "/",
  "/calendar",
  "/leases",
  "/leases/new",
  "/units",
  "/tenants",
  "/payments",
  "/reports",
  "/plan",
  "/settings",
  "/settings/users",
  "/settings/general",
  "/settings/buildings",
  "/settings/unit-types",
  "/settings/reminder-emails",
  "/settings/privacy",
  "/settings/import",
  "/settings/audit-log",
  "/settings/your-data",
  "/account",
  "/requests",
  "/settings/support-access",
];

for (const path of APP) {
  test(`app ${path}`, async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto(path);
    await check(page, path);
  });
}

test("app: a lease, a tenant and a unit", async ({ page }) => {
  await signInAs(page, "admin");
  await page.goto("/leases");
  await page
    .getByRole("link", { name: /LSE-E2E-0001/ })
    .first()
    .click();
  await check(page, "lease page");
  await page.goto("/tenants");
  await page.getByRole("link", { name: "Calendar Test Co" }).first().click();
  await check(page, "tenant page");
});
