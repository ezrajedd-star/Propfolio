import { createHash, randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { base32Decode, totpCode, totpStep } from "../src/domain/auth/totp";
import { PASSWORD, PLATFORM_ADMIN, USERS, signIn, signInAs } from "./fixtures";

/** The platform admin (Propfolio staff) area, from sign-in to suspending an account. */
test.describe.configure({ mode: "serial" });

/** A code for the next 30-second step, so a code is never reused within a run. */
let lastStep = 0;
function nextCode(secret: string = PLATFORM_ADMIN.totpSecret) {
  const step = Math.max(totpStep(new Date()), lastStep + 1);
  lastStep = step;
  return totpCode(base32Decode(secret), step);
}

async function platformSignIn(page: Page) {
  await page.goto("/platform/login");
  await page.getByLabel("Email").fill(PLATFORM_ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(PLATFORM_ADMIN.password);
  await page.getByRole("textbox", { name: "6-digit code" }).fill(nextCode());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
}

test("signed-out visitors and customers can't open the platform area", async ({ page }) => {
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/platform\/login/);
  await signInAs(page, "admin");
  await page.goto("/platform/accounts/00000000-0000-7000-8000-0000000e2e01");
  await expect(page).toHaveURL(/\/platform\/login/);
});

test("a wrong code is refused with the same message as a wrong password", async ({ page }) => {
  await page.goto("/platform/login");
  await page.getByLabel("Email").fill(PLATFORM_ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(PLATFORM_ADMIN.password);
  await page.getByRole("textbox", { name: "6-digit code" }).fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That didn't work" })).toBeVisible();
});

test("lists accounts with no tenant data, and suspends and reactivates one", async ({ page }) => {
  await platformSignIn(page);
  await expect(page.getByRole("link", { name: "E2E Leasing Co." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Other Leasing Inc." })).toBeVisible();
  for (const tenant of ["Overdue Trading", "ABC Corporation", "Calendar Test Co"]) {
    await expect(page.getByText(tenant)).toHaveCount(0);
  }

  await page.getByRole("link", { name: "Other Leasing Inc." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Other Leasing Inc." })).toBeVisible();
  await expect(page.getByText(`${USERS.other.name} (${USERS.other.email})`)).toBeVisible();

  // Extend the trial and record a bank transfer.
  await page.getByLabel("Last day of the trial").fill("2099-12-31");
  await page.getByLabel("Why").fill("E2E check");
  await page.getByRole("button", { name: "Extend trial" }).click();
  await expect(page.getByText("Trial extended ✓")).toBeVisible();
  await expect(page.getByText("31 Dec 2099").first()).toBeVisible();

  await page.getByLabel("Amount received").fill("18,000");
  await page.getByLabel("Paid until").fill("2099-01-31");
  await page.getByLabel("Bank reference").fill("E2E-BDO-1");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("cell", { name: "E2E-BDO-1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "₱18,000.00" })).toBeVisible();

  // Suspend: its people can't sign in.
  await page.getByRole("button", { name: "Suspend account" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("E2E suspension check");
  await page.getByRole("dialog").getByRole("button", { name: "Suspend account" }).click();
  await expect(page.getByText("Suspended", { exact: true }).first()).toBeVisible();

  const customer = await page.context().browser()!.newPage();
  await signIn(customer, USERS.other.email, PASSWORD);
  await expect(customer.getByRole("alert").filter({ hasText: "account is paused" })).toBeVisible();

  await page.getByRole("button", { name: "Reactivate account" }).click();
  await expect(page.getByText("can sign in again ✓")).toBeVisible();
  await signInAs(customer, "other");
  await customer.close();

  await expect(
    page.getByRole("main").getByRole("listitem").filter({ hasText: "Account suspended" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/platform\/login\?reason=signed-out/);
});

test("a new platform admin sets up their password and authenticator from the one-time link", async ({
  page,
}) => {
  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  const token = randomBytes(32).toString("base64url");
  await db.platformAdmin.upsert({
    where: { email: "newbie@e2e.test" },
    create: {
      email: "newbie@e2e.test",
      name: "Nina New",
      setupTokenHash: createHash("sha256").update(token).digest("hex"),
      setupTokenExpiresAt: new Date(Date.now() + 3_600_000),
    },
    update: {},
  });
  await db.$disconnect();

  await page.goto(`/platform/setup?token=${token}`);
  await expect(page.getByRole("heading", { name: "Welcome, Nina New" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const secret = (await page.locator(".font-mono").innerText()).replace(/\s/g, "");
  await page.getByLabel("Password", { exact: true }).fill("a new platform passphrase");
  await page.getByLabel("Type it again").fill("a new platform passphrase");
  await page.getByRole("textbox", { name: "6-digit code" }).fill(nextCode(secret));
  await page.getByRole("button", { name: "Finish set-up" }).click();
  await expect(page.getByText("You're all set")).toBeVisible();

  // The link worked once.
  await page.goto(`/platform/setup?token=${token}`);
  await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
});
