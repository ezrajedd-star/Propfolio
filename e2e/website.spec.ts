import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { signInAs } from "./fixtures";

/** The public website: the home page at "/", the interactive parts and "Book a demo". */
const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
const DEMO_EMAIL = `demo.${Date.now()}@website.example`;

test.afterAll(async () => {
  await db.demoRequest.deleteMany({ where: { email: DEMO_EMAIL } });
  await db.$disconnect();
});

test("signed out, / is the website; signed in, / is the app", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Never miss a lease renewal again." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start free" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Start free" })).toBeVisible();

  await signInAs(page, "admin");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Never miss a lease renewal again." }),
  ).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
});

test("the header links reach every page", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Site" });
  for (const [label, heading] of [
    ["Product", "Every lease, every peso"],
    ["Pricing", "Simple monthly plans"],
    ["Customers", "Lessors who stopped chasing dates"],
    ["Help", "How can we help?"],
    ["About", "We built the lease ledger"],
  ] as const) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
});

test("the product preview switches screens", async ({ page }) => {
  await page.goto("/");
  const preview = page.getByRole("figure", { name: /preview of Propfolio/ });
  await preview.getByRole("tab", { name: "Reminder email" }).click();
  await expect(preview.getByText("3 leases need attention today")).toBeVisible();
  await preview.getByRole("tab", { name: "Rent schedule" }).click();
  await expect(preview.getByText("₱55,125.00")).toBeVisible();
  await preview.getByRole("tab", { name: "Payments" }).click();
  await expect(preview.getByText("31 days late")).toBeVisible();
});

test("the plan picker suggests a plan from the sliders", async ({ page }) => {
  await page.goto("/pricing");
  const units = page.getByLabel("How many units do you lease out?");
  await units.fill("2");
  await expect(page.getByText("2 units fit in Free")).toBeVisible();
  await units.fill("40");
  await expect(page.getByText("40 units fit in Pro")).toBeVisible();
  await page.getByLabel("How many people will sign in?").fill("3");
  await expect(page.getByText("3 people need Premium")).toBeVisible();
  await units.fill("250");
  await expect(page.getByRole("link", { name: "Talk to us" })).toBeVisible();
});

test("the help centre search narrows the answers", async ({ page }) => {
  await page.goto("/help");
  await page.getByRole("searchbox", { name: "Search the help centre" }).fill("GCash");
  await expect(page.getByText("1 answer found")).toBeVisible();
  await page.getByText("How do I pay?").click();
  await expect(page.getByText(/by card, GCash or Maya/)).toBeVisible();
  await page.getByRole("searchbox").fill("zzzz");
  await expect(page.getByText(/No answer matches/)).toBeVisible();
});

test("placeholder stories are clearly marked", async ({ page }) => {
  await page.goto("/customers");
  await expect(page.getByText("These stories are placeholders.")).toBeVisible();
  await expect(page.getByText("Placeholder", { exact: true }).first()).toBeVisible();
});

test("book a demo: mistakes are explained, then the request is kept", async ({ page }) => {
  await page.goto("/contact#demo");
  await page.getByRole("button", { name: "Book my demo" }).click();
  await expect(page.getByText("Enter a name.")).toBeVisible();
  await expect(page.getByText("Choose how many units you lease out.")).toBeVisible();

  await page.getByLabel("Your name").fill("Dina Demo");
  await page.getByLabel("Work email").fill(DEMO_EMAIL);
  await page.getByRole("textbox", { name: "Company" }).fill("Demo Realty");
  await page.getByLabel("How many units do you lease out?").selectOption("11–50");
  await page.getByRole("button", { name: "Book my demo" }).click();
  await expect(page.getByText("Thank you! We'll be in touch.")).toBeVisible();
  await expect.poll(() => db.demoRequest.count({ where: { email: DEMO_EMAIL } })).toBe(1);
});
