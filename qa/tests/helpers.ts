import { expect, type Page } from "@playwright/test";

export const QA_EMAIL = process.env.QA_EMAIL ?? "";
export const QA_PASSWORD = process.env.QA_PASSWORD ?? "";
export const hasCredentials = Boolean(QA_EMAIL && QA_PASSWORD);

/** Everything the QA run creates carries this label, so testers can tell it apart. */
export const QA_LABEL = "QA Robot";

export async function signIn(page: Page) {
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
