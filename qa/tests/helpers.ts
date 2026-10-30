import { randomBytes } from "node:crypto";

import { expect, type Browser, type Page } from "@playwright/test";

export const QA_EMAIL = process.env.QA_EMAIL ?? "";
export const QA_PASSWORD = process.env.QA_PASSWORD ?? "";
export const hasCredentials = Boolean(QA_EMAIL && QA_PASSWORD);

/** Everything the QA run creates carries this label, so testers can tell it apart. */
export const QA_LABEL = "QA Robot";

/** Tours open by themselves on a person's first visit to some pages; the robot skips them. */
export async function skipToursAutomatically(page: Page) {
  await page.addLocatorHandler(page.getByRole("button", { name: "Skip tour" }), async (button) => {
    await button.click();
  });
}

export async function signIn(page: Page) {
  await skipToursAutomatically(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill(QA_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  if (new URL(page.url()).pathname.startsWith("/change-password")) {
    throw new Error(
      "The QA account must change its password first. Sign in once by hand, set the password, and use that.",
    );
  }
  // The welcome tour may appear for a new QA account; finish it so it doesn't cover the page.
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
}

/** Fail on server errors and on uncaught errors in the browser. */
export function watchForErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`Browser error: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} from ${new URL(r.url()).pathname}`);
  });
  return problems;
}

export async function expectNoErrorPage(page: Page) {
  await expect(page.getByText("Something went wrong", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export function manilaToday(offsetDays = 0): string {
  const d = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export type QaRole = "LEASING_STAFF" | "VIEWER";
export interface QaAccount {
  role: QaRole;
  name: string;
  email: string;
  password: string;
}

const ROLE_CHOICE: Record<QaRole, string> = {
  LEASING_STAFF: "Leasing Staff",
  VIEWER: "Property Management (Viewer)",
};

/**
 * The QA Admin creates a throwaway account for a role (labelled "QA Robot"), signs in as it once
 * and sets a random password. Accounts are turned off again by `turnOffAccounts`.
 */
export async function createRoleAccount(
  admin: Page,
  browser: Browser,
  role: QaRole,
): Promise<QaAccount> {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const name = `${QA_LABEL} ${role === "VIEWER" ? "Viewer" : "Leasing"} ${stamp}`;
  const email = `qa-${role === "VIEWER" ? "viewer" : "leasing"}-${stamp}@propfolio.test`;
  await admin.goto("/settings/users");
  await admin.getByRole("button", { name: "Add user" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Work email").fill(email);
  await dialog.getByText(ROLE_CHOICE[role], { exact: true }).click();
  await dialog.getByRole("button", { name: "Add user" }).click();
  const temporary = (await dialog.getByTestId("temporary-password").textContent())!.trim();
  await dialog.getByRole("button", { name: "Done" }).click();

  const password = `qa-${randomBytes(18).toString("base64url")}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(temporary);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/change-password/);
  await page.getByLabel("Temporary password").fill(temporary);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Type the new password again").fill(password);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await context.close();
  return { role, name, email, password };
}

export async function signInWith(page: Page, account: { email: string; password: string }) {
  await skipToursAutomatically(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
}

export async function turnOffAccounts(admin: Page, accounts: QaAccount[]) {
  for (const a of accounts) {
    await admin.goto("/settings/users");
    const row = admin.getByRole("row", { name: new RegExp(a.name) });
    if (!(await row.count())) continue;
    await row.getByRole("button", { name: `Actions for ${a.name}` }).click();
    const off = admin.getByRole("menuitem", { name: "Turn off account" });
    if (!(await off.isVisible().catch(() => false))) {
      await admin.keyboard.press("Escape");
      continue;
    }
    await off.click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "Turn off account" }).click();
    await expect(row).toContainText(/off/i);
  }
}

/** The QA building and unit used by tests that need a lease (made once, then reused). */
export const QA_BUILDING = `${QA_LABEL} (automated checks)`;
export async function ensureQaUnit(admin: Page) {
  await admin.goto("/settings/buildings");
  if (await admin.getByRole("link", { name: QA_BUILDING }).count()) {
    await archiveLeftoverQaLeases(admin);
    return;
  }
  await admin.getByRole("button", { name: "Add building" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Building name", { exact: true }).fill(QA_BUILDING);
  await dialog.getByLabel("Short code", { exact: true }).fill("QAR");
  await dialog.getByLabel("Address", { exact: true }).fill("For automated checks only");
  await dialog.getByRole("button", { name: "Add building" }).click();
  await expect(admin.getByRole("heading", { level: 1, name: QA_BUILDING })).toBeVisible();
  await admin.getByRole("button", { name: "Add unit" }).first().click();
  await admin.getByRole("dialog").getByLabel("Unit number or name", { exact: true }).fill("QA-1");
  await admin.getByRole("dialog").getByRole("button", { name: "Add unit" }).click();
  await expect(admin.getByText("Unit QA-1 added ✓")).toBeVisible();
}

/** Create a QA tenant + lease on unit QA-1 through the wizard; returns the lease page URL. */
export async function createQaLease(
  page: Page,
  tenantName: string,
  rent = "12,345",
): Promise<string> {
  await page.goto("/leases/new");
  const restart = page.getByRole("button", { name: /Start over|Start a new lease/ });
  if (await restart.isVisible({ timeout: 1000 }).catch(() => false)) await restart.click();
  await page.getByRole("radio", { name: new RegExp(`Unit QA-1 ${QA_LABEL}`) }).check();
  await page.getByRole("button", { name: "Next: Tenant" }).click();
  await page.getByRole("button", { name: "Add a new tenant" }).click();
  await page.getByLabel("Display name", { exact: true }).fill(tenantName);
  await page
    .getByLabel("The tenant has received and acknowledged the privacy notice.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Add tenant and continue" }).click();
  await page.getByLabel("First day of the lease", { exact: true }).fill(manilaToday(-45));
  await page.getByLabel("Last day of the lease", { exact: true }).fill(manilaToday(320));
  await page.getByLabel("Monthly rent", { exact: true }).fill(rent);
  await page.getByLabel("Rent due on day", { exact: true }).fill("5");
  await page.getByLabel("Security deposit", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Next: Review and save" }).click();
  await page.getByRole("button", { name: "Save lease" }).click();
  await expect(page.getByRole("heading", { level: 1, name: tenantName })).toBeVisible();
  return page.url();
}

/** Archive any QA lease an earlier, interrupted run left on the QA unit. */
async function archiveLeftoverQaLeases(page: Page) {
  for (let i = 0; i < 10; i++) {
    await page.goto(`/leases?building=&q=${encodeURIComponent(QA_LABEL)}`);
    const link = page.getByRole("link", { name: /^LSE-\d{4}-\d{4}$/ }).first();
    if (!(await link.count())) return;
    await link.click();
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(page.getByText("Archived").first()).toBeVisible();
  }
}

/** Archive a QA lease and its tenant (clean-up). */
export async function archiveQaLease(page: Page, leaseUrl: string, tenantName: string) {
  await page.goto(leaseUrl);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("Archived").first()).toBeVisible();
  await page.getByRole("link", { name: tenantName }).first().click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Tenant archived")).toBeVisible();
}
