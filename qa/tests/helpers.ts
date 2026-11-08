import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Browser, type Cookie, type Page } from "@playwright/test";

import { base32Decode, totpCode, totpStep } from "../../src/domain/auth/totp";

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

/**
 * The QA account is an Admin, so it uses two-step sign-in. QA_TOTP_SECRET is the setup key shown
 * under "Can't scan?" when two-step sign-in was set up for it by hand (environment only).
 */
export const QA_TOTP_SECRET = (process.env.QA_TOTP_SECRET ?? "").replace(/\s/g, "");

// The robot ticks "Don't ask again on this device" once, and reuses that device cookie for the
// rest of the run (kept in the git-ignored results folder, so a restarted worker has it too).
const DEVICE_FILE = path.resolve(__dirname, "../../qa-results/.qa-device.json");
let lastStep = 0;

async function answerCodeStep(page: Page) {
  if (!QA_TOTP_SECRET) {
    throw new Error(
      "The QA account uses two-step sign-in: add its setup key to QA_TOTP_SECRET in the environment.",
    );
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    // Each code works once: never reuse a 30-second step.
    let step = totpStep(new Date());
    if (step <= lastStep) {
      await page.waitForTimeout((lastStep + 1) * 30_000 - Date.now() + 500);
      step = totpStep(new Date());
    }
    lastStep = step;
    await page
      .getByRole("textbox", { name: "Code" })
      .fill(totpCode(base32Decode(QA_TOTP_SECRET), step));
    const remember = page.getByLabel(/Don't ask for a code on this device/);
    if (!(await remember.isChecked())) await remember.check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 })
      .catch(() => undefined);
    if (!new URL(page.url()).pathname.startsWith("/login")) break;
  }
  const device = (await page.context().cookies()).find((c) => c.name.endsWith("propfolio_device"));
  if (device) {
    await mkdir(path.dirname(DEVICE_FILE), { recursive: true });
    await writeFile(DEVICE_FILE, JSON.stringify(device), { mode: 0o600 });
  }
}

// The QA account's session is reused for the whole run, so the robot doesn't sign in dozens of
// times (sign-in is rate-limited per address and per email).
const SESSION_FILE = path.resolve(__dirname, "../../qa-results/.qa-session.json");

export async function signIn(page: Page) {
  await skipToursAutomatically(page);
  const saved = await readFile(DEVICE_FILE, "utf8").catch(() => null);
  if (saved) await page.context().addCookies([JSON.parse(saved) as Cookie]);
  const session = await readFile(SESSION_FILE, "utf8").catch(() => null);
  if (session) {
    await page.context().addCookies([JSON.parse(session) as Cookie]);
    await page.goto("/");
    if (!new URL(page.url()).pathname.startsWith("/login")) {
      await acceptTermsIfAsked(page);
      return;
    }
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(QA_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login") || u.pathname === "/login/code", {
    timeout: 20_000,
  });
  if (new URL(page.url()).pathname === "/login/code") await answerCodeStep(page);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  if (new URL(page.url()).pathname.startsWith("/change-password")) {
    throw new Error(
      "The QA account must change its password first. Sign in once by hand, set the password, and use that.",
    );
  }
  if (new URL(page.url()).pathname.startsWith("/setup-two-step")) {
    throw new Error(
      "The QA account must set up two-step sign-in first. Do it once by hand (use “Can't scan?”), and put the setup key in QA_TOTP_SECRET.",
    );
  }
  await acceptTermsIfAsked(page);
  const cookie = (await page.context().cookies()).find((c) => c.name.endsWith("propfolio_session"));
  if (cookie) {
    await mkdir(path.dirname(SESSION_FILE), { recursive: true });
    await writeFile(SESSION_FILE, JSON.stringify(cookie), { mode: 0o600 });
  }
  // The welcome tour may appear for a new QA account; finish it so it doesn't cover the page.
  const skip = page.getByRole("button", { name: "Skip tour" });
  // The auto-skip handler (skipToursAutomatically) may already have closed it; don't wait for it.
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false))
    await skip.click({ timeout: 3000 }).catch(() => undefined);
}

/**
 * People are asked to accept new versions of the Terms, Privacy Policy and DPA at sign-in. The
 * robot accepts them (it is a test account on the test site).
 */
export async function acceptTermsIfAsked(page: Page) {
  if (!new URL(page.url()).pathname.startsWith("/accept-terms")) return;
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/accept-terms"), { timeout: 20_000 });
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
 * The QA Admin invites a throwaway person for a role (labelled "QA Robot"), who joins from the
 * invitation link with a random password. Accounts are turned off again by `turnOffAccounts`.
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
  await admin.getByRole("button", { name: "Invite someone" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Their work email").fill(email);
  await dialog.getByText(ROLE_CHOICE[role], { exact: true }).click();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  // The link is also shown to the inviter (the robot can't read the invitation email).
  const link = (await dialog.getByTestId("invite-link").textContent())!.trim();
  await dialog.getByRole("button", { name: "Done" }).click();

  // The invited person joins in their own browser and chooses their own password.
  const password = `qa-${randomBytes(18).toString("base64url")}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL(link).pathname);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Choose a password").fill(password);
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Join the team" }).click();
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
  await acceptTermsIfAsked(page);
  const skip = page.getByRole("button", { name: "Skip tour" });
  // The auto-skip handler (skipToursAutomatically) may already have closed it; don't wait for it.
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false))
    await skip.click({ timeout: 3000 }).catch(() => undefined);
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
