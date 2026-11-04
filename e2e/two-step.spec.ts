import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { base32Decode, totpCode, totpStep } from "../src/domain/auth/totp";
import { E2E_ACCOUNT_ID, PASSWORD, USERS, signIn, signInAs } from "./fixtures";

/** Two-step sign-in, as an Admin who hasn't set it up yet experiences it. */
test.describe.configure({ mode: "serial" });

const EMAIL = "tina.twostep@e2e.test";
let secret = "";
let recoveryCodes: string[] = [];

/** A code from a 30-second step not used before in this run (codes work once). */
let lastStep = 0;
function nextCode() {
  const step = Math.max(totpStep(new Date()), lastStep + 1);
  lastStep = step;
  return totpCode(base32Decode(secret), step);
}

async function typeCode(page: Page, code: string, remember = false) {
  await expect(page.getByRole("heading", { name: "Type your code" })).toBeVisible();
  await page.getByRole("textbox", { name: "Code" }).fill(code);
  if (remember) await page.getByLabel(/Don't ask for a code on this device/).check();
  await page.getByRole("button", { name: "Continue" }).click();
}

test.beforeAll(async () => {
  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  await db.user.deleteMany({ where: { email: EMAIL } });
  // Premium includes 5 people: turn off anyone earlier specs added (e.g. "Nina New"), so Tina is
  // within the limit alongside the four fixture users.
  await db.membership.updateMany({
    where: {
      accountId: E2E_ACCOUNT_ID,
      user: { email: { notIn: Object.values(USERS).map((u) => u.email) } },
    },
    data: { isActive: false },
  });
  await db.user.create({
    data: {
      name: "Tina Twostep",
      email: EMAIL,
      passwordHash: await hash(PASSWORD),
      mustChangePassword: false,
      memberships: { create: { accountId: E2E_ACCOUNT_ID, role: "ADMIN" } },
    },
  });
  await db.$disconnect();
});

test("an Admin must set up two-step sign-in before anything else", async ({ page }) => {
  await signIn(page, EMAIL);
  await expect(page).toHaveURL(/\/setup-two-step/);
  await expect(page.getByRole("heading", { name: "Set up two-step sign-in" })).toBeVisible();
  // Other pages send them back here.
  await page.goto("/leases");
  await expect(page).toHaveURL(/\/setup-two-step/);

  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  secret = (await page.getByTestId("setup-key").innerText()).replace(/\s/g, "");
  await page.getByRole("textbox", { name: "6-digit code" }).fill("000000");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();

  await page.getByRole("textbox", { name: "6-digit code" }).fill(nextCode());
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.getByRole("heading", { name: "Two-step sign-in is on ✓" })).toBeVisible();
  recoveryCodes = await page.locator("ul.font-mono li").allInnerTexts();
  expect(recoveryCodes).toHaveLength(10);
  await expect(page.getByRole("button", { name: "Done" })).toBeDisabled();
  await page.getByLabel("I've saved my recovery codes").check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Two-step sign-in is on ✓")).toBeVisible();
});

test("signing in asks for the code; 'don't ask again' remembers this browser", async ({ page }) => {
  await signIn(page, EMAIL);
  await typeCode(page, "123456");
  await expect(page.getByText("That code didn't work").first()).toBeVisible();
  await typeCode(page, nextCode(), true);
  await expect(page).toHaveURL(/\/$/);

  await page.context().clearCookies({ name: /session/ });
  await signIn(page, EMAIL);
  await expect(page).toHaveURL(/\/$/);
});

test("a recovery code works once when the phone is lost", async ({ page }) => {
  await signIn(page, EMAIL);
  await typeCode(page, recoveryCodes[0]!);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account/two-step");
  await expect(page.getByText("Recovery codes left: 9 of 10.")).toBeVisible();
  // Admins can't turn it off.
  await expect(page.getByRole("button", { name: "Turn off two-step sign-in" })).toHaveCount(0);
});

test("an Owner can reset it for a member who lost their phone", async ({ page }) => {
  await signInAs(page, "admin");
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Actions for Tina Twostep" }).click();
  await page.getByRole("menuitem", { name: "Reset two-step sign-in" }).click();
  await page.getByRole("button", { name: "Reset two-step sign-in" }).click();
  await expect(page.getByText("Tina Twostep will set up two-step sign-in again ✓")).toBeVisible();

  const tina = await page.context().browser()!.newPage();
  await signIn(tina, EMAIL);
  await expect(tina).toHaveURL(/\/setup-two-step/);
  await tina.close();
});
