import { expect, test, type Page } from "@playwright/test";

import {
  createRoleAccount,
  hasCredentials,
  signIn,
  signInWith,
  turnOffAccounts,
  watchForErrors,
  type QaAccount,
} from "./helpers";

/**
 * What each role can and cannot do, checked from the outside like an attacker would:
 * menus, pages, downloads and API calls, plus guessing addresses (IDOR).
 * The QA Admin creates a throwaway Leasing Staff and Viewer account for the run and turns them off at the end.
 */
test.describe("@roles every role sees only what it should", () => {
  test.skip(!hasCredentials, "Set QA_EMAIL and QA_PASSWORD (an Admin account) to run");
  // Keep going after a failure so one finding doesn't hide the others.
  test.describe.configure({ mode: "default" });

  let leasing: QaAccount;
  let viewer: QaAccount;
  const RANDOM_ID = "0195f3a2-7b1c-7d00-9e00-00000a3f9a21";

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    leasing = await createRoleAccount(page, browser, "LEASING_STAFF");
    viewer = await createRoleAccount(page, browser, "VIEWER");
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    await turnOffAccounts(page, [leasing, viewer].filter(Boolean));
    await page.close();
  });

  const menu = (page: Page) =>
    page.getByRole("navigation", { name: "Main" }).first().getByRole("link");

  test("Viewer: menu is Home, Calendar and Units only", async ({ page }) => {
    await signInWith(page, viewer);
    await expect(menu(page)).toHaveText(["Home", "Calendar", "Units"]);
  });

  test("Viewer: every leasing and admin page is refused", async ({ page }) => {
    const problems = watchForErrors(page);
    await signInWith(page, viewer);
    for (const path of [
      "/leases",
      "/leases/new",
      `/leases/${RANDOM_ID}`,
      "/tenants",
      "/tenants/new",
      "/payments",
      "/payments/new",
      "/reports",
      "/reports/aging",
      "/settings",
      "/settings/users",
      "/settings/audit-log",
      "/settings/privacy",
      "/settings/feedback",
    ]) {
      await page.goto(path);
      await expect(page, `${path} should be refused`).toHaveURL(/\/no-access/);
    }
    expect(problems).toEqual([]);
  });

  test("Viewer: downloads and APIs with money or contact data are refused", async ({ page }) => {
    await signInWith(page, viewer);
    for (const path of [
      "/api/v1/leases/export?format=csv",
      "/api/v1/payments/overdue/export?format=csv",
      "/api/v1/reports/rent-roll/export?format=csv",
      "/api/v1/reports/aging/export?format=csv",
      `/api/v1/documents/${RANDOM_ID}/link`,
      `/api/v1/tenants/${RANDOM_ID}/privacy-export`,
      "/api/v1/users",
      "/api/v1/audit-log",
      "/api/v1/feedback/export",
    ]) {
      const r = await page.request.get(path, { maxRedirects: 0 });
      expect(r.status(), path).toBe(403);
    }
  });

  test("Viewer: what they CAN see carries no money, contact or lease details", async ({ page }) => {
    await signInWith(page, viewer);
    const today = new Date().toISOString().slice(0, 10);
    const later = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    const cal = await page.request.get(`/api/v1/calendar?from=${today}&to=${later}`);
    expect(cal.status()).toBe(200);
    const body = await cal.text();
    for (const key of [
      "monthlyRent",
      "balance",
      "overdue",
      "email",
      "phone",
      "contactPerson",
      "refNo",
      "LSE-",
    ]) {
      expect(body, `calendar must not contain ${key}`).not.toContain(key);
    }
    for (const path of ["/", "/units", "/calendar"]) {
      await page.goto(path);
      await expect(page.locator("main"), `${path} shows no peso amounts`).not.toContainText("₱");
      await expect(page.locator("main"), `${path} shows no lease numbers`).not.toContainText(
        /LSE-\d{4}/,
      );
    }
  });

  test("Leasing Staff: no Settings, and admin pages and APIs are refused", async ({ page }) => {
    await signInWith(page, leasing);
    await expect(menu(page)).not.toContainText(["Settings"]);
    for (const path of [
      "/settings",
      "/settings/users",
      "/settings/audit-log",
      "/settings/privacy",
      "/settings/general",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/no-access/);
    }
    for (const path of [
      "/api/v1/users",
      "/api/v1/audit-log",
      "/api/v1/feedback/export",
      `/api/v1/tenants/${RANDOM_ID}/privacy-export`,
    ]) {
      const r = await page.request.get(path, { maxRedirects: 0 });
      expect(r.status(), path).toBe(403);
    }
  });

  test("Leasing Staff: daily work pages open; privacy tools are hidden", async ({ page }) => {
    const problems = watchForErrors(page);
    await signInWith(page, leasing);
    for (const path of [
      "/leases",
      "/leases/new",
      "/tenants",
      "/payments",
      "/payments/new",
      "/reports",
      "/reports/collections",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
      await expect(page).not.toHaveURL(/no-access/);
    }
    await page.goto("/tenants");
    await page.locator("main a[href^='/tenants/']:not([href='/tenants/new'])").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download their data" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Anonymise" })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("Guessing addresses (IDOR): unknown or malformed ids give 'not found', never an error", async ({
    page,
  }) => {
    const problems = watchForErrors(page);
    await signInWith(page, leasing);
    for (const path of [
      `/leases/${RANDOM_ID}`,
      "/leases/not-a-real-id",
      "/leases/..%2F..%2Fetc%2Fpasswd",
      `/tenants/${RANDOM_ID}`,
      "/tenants/1%20OR%201%3D1",
      `/payments/${RANDOM_ID}`,
      `/units/${RANDOM_ID}`,
      "/reports/not-a-report",
    ]) {
      const r = await page.goto(path);
      expect.soft(r?.status() ?? 0, path).toBeLessThan(500);
    }
    for (const path of [
      `/api/v1/documents/${RANDOM_ID}/link`,
      '/api/v1/documents/\'; DROP TABLE "Lease";--/link',
      "/api/v1/files/not-a-key?e=1&s=x",
      "/api/v1/reports/nope/export",
    ]) {
      const r = await page.request.get(path, { maxRedirects: 0 });
      expect.soft(r.status(), path).toBeGreaterThanOrEqual(400);
      expect.soft(r.status(), path).toBeLessThan(500);
    }
    expect(problems).toEqual([]);
  });

  test("Signing out really ends the session (back button and old cookie)", async ({
    page,
    context,
  }) => {
    await signInWith(page, leasing);
    const cookies = await context.cookies();
    await page.goto("/leases");
    await page
      .getByRole("button", { name: new RegExp(leasing.name) })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    // Replaying the old session cookie must not work.
    await context.addCookies(cookies);
    const r = await page.request.get("/api/v1/me");
    expect(r.status()).toBe(401);
  });

  test("Five wrong passwords lock the account, with a clear message", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.goto("/login");
      await page.getByLabel("Email").fill(viewer.email);
      await page.getByLabel("Password", { exact: true }).fill(`wrong-password-${i}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert").first()).toBeVisible();
    }
    // Even the right password is refused while locked.
    await page.goto("/login");
    await page.getByLabel("Email").fill(viewer.email);
    await page.getByLabel("Password", { exact: true }).fill(viewer.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /locked/i })).toBeVisible();
  });
});
