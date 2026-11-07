import { createHmac } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_APP_SECRET, E2E_DATABASE_URL } from "../playwright.config";
import { currentVersions } from "../src/domain/legal/documents";
import { PASSWORD, USERS, signIn } from "./fixtures";

/**
 * Self-serve sign-up from the outside: "Start free", the 6-digit code on the same screen, and
 * landing in the app with the trial running and the onboarding steps waiting. The code is set to
 * a known value in the database (the e2e server only logs emails).
 */
test.describe.configure({ mode: "serial" });

const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
const EMAIL = `maria.${Date.now()}@santos-realty.example`;

test.afterAll(async () => {
  // Leave the staff fixture with the current versions, whatever happened above.
  const staff = await db.user.findUniqueOrThrow({ where: { email: USERS.staff.email } });
  await db.legalAcceptance.deleteMany({ where: { userId: staff.id } });
  await db.legalAcceptance.createMany({
    data: currentVersions().map((v) => ({ userId: staff.id, ...v })),
  });
  await db.$disconnect();
});

/** Make the waiting sign-up's code 123456 (same HMAC as the app). */
async function setCode(email: string) {
  const pending = await db.pendingSignUp.findFirstOrThrow({ where: { email } });
  const codeHash = createHmac("sha256", E2E_APP_SECRET)
    .update(`signup:${pending.id}:123456`)
    .digest("hex");
  await db.pendingSignUp.update({ where: { id: pending.id }, data: { codeHash } });
}

async function fillForm(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByRole("link", { name: "Start free" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Start free" })).toBeVisible();
  await page.getByLabel("Your name").fill("Maria Santos");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("a long sunny afternoon");
  await page.getByLabel("The name you lease under").fill("Santos Realty");
}

test("Start free: form, code on the same screen, then straight into the app", async ({ page }) => {
  await fillForm(page, EMAIL);
  await page.getByRole("button", { name: "Start free" }).click();
  // The checkbox is required.
  await expect(page.getByText("Please accept the Terms of Service")).toBeVisible();
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Start free" }).click();

  await expect(page.getByText(`We sent a 6-digit code to ${EMAIL.toLowerCase()}`)).toBeVisible();
  await setCode(EMAIL.toLowerCase());
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page.getByText(/That code isn't right.*4 tries left/)).toBeVisible();

  await page.getByLabel("Code").fill("123 456");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Maria");
  await expect(page.getByText(/Premium trial: \d+ days left/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Import from Excel, or add units/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Turn on two-step sign-in/ })).toBeVisible();
});

test("the same email can't sign up twice", async ({ page }) => {
  await fillForm(page, USERS.admin.email);
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Start free" }).click();
  await expect(
    page.getByText("That email already has an account. Sign in instead?").first(),
  ).toBeVisible();
});

test("a new version of the Terms is asked for at the next sign-in", async ({ page }) => {
  const user = await db.user.findUniqueOrThrow({ where: { email: USERS.staff.email } });
  await db.legalAcceptance.updateMany({
    where: { userId: user.id, document: "TERMS" },
    data: { version: "2020-01-01" },
  });
  await signIn(page, USERS.staff.email, PASSWORD);
  await expect(page).toHaveURL(/\/accept-terms/);
  await expect(
    page.getByRole("listitem").getByRole("link", { name: "Terms of Service" }),
  ).toBeVisible();
  await page.getByLabel(/I accept the/).check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    USERS.staff.name.split(" ")[0]!,
  );
});

test("the legal pages are public", async ({ page }) => {
  await page.goto("/legal/dpa");
  await expect(
    page.getByRole("heading", { level: 1, name: "Data Processing Agreement" }),
  ).toBeVisible();
  await expect(page.getByText("[LAWYER TO SUPPLY]")).toBeVisible();
});
