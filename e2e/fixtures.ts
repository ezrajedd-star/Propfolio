import { expect, type Page } from "@playwright/test";

/** Known passwords for synthetic e2e users, created fresh by global-setup. */
export const PASSWORD = "e2e password for tests";

export const USERS = {
  admin: { email: "admin@e2e.test", name: "Ada Admin" },
  staff: { email: "staff@e2e.test", name: "Sam Staff" },
  viewer: { email: "viewer@e2e.test", name: "Vic Viewer" },
  lockme: { email: "lockme@e2e.test", name: "Lou Locked" },
} as const;

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
