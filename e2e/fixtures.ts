import { expect, type Page } from "@playwright/test";

/** Known passwords for synthetic e2e users, created fresh by global-setup. */
export const PASSWORD = "e2e password for tests";

export const USERS = {
  admin: { email: "admin@e2e.test", name: "Ada Admin" },
  staff: { email: "staff@e2e.test", name: "Sam Staff" },
  viewer: { email: "viewer@e2e.test", name: "Vic Viewer" },
  lockme: { email: "lockme@e2e.test", name: "Lou Locked" },
  /** The Owner of a second, unrelated customer account. */
  other: { email: "other@e2e.test", name: "Olga Other" },
} as const;

/** Propfolio staff: a platform admin with a known authenticator secret (base32). */
export const PLATFORM_ADMIN = {
  email: "platform@e2e.test",
  name: "Pat Platform",
  password: "e2e platform passphrase",
  totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
} as const;

/** The main e2e account ("E2E Leasing Co.") and a second customer for separation checks. */
export const E2E_ACCOUNT_ID = "00000000-0000-7000-8000-0000000e2e01";
export const OTHER_ACCOUNT_ID = "00000000-0000-7000-8000-0000000e2e02";

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInAs(page: Page, who: keyof typeof USERS) {
  await signIn(page, USERS[who].email);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    USERS[who].name.split(" ")[0]!,
  );
}
