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

const LEAD_EMAIL = `lead.${Date.now()}@website.example`;

test.describe("more website pages", () => {
  test.afterAll(async () => {
    await db.websiteLead.deleteMany({ where: { email: LEAD_EMAIL } });
  });

  test("the free lease tracker downloads after name and email", async ({ page }) => {
    await page.goto("/resources");
    await page.getByRole("button", { name: "Get the free template" }).click();
    await expect(page.getByText("Enter a name.")).toBeVisible();
    await page.getByLabel("Your name").fill("Lito Lessor");
    await page.getByLabel("Email", { exact: true }).fill(LEAD_EMAIL);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Get the free template" }).click();
    expect((await download).suggestedFilename()).toBe("Propfolio lease tracker.xlsx");
    await expect(page.getByText("Your download has started.")).toBeVisible();
  });

  test("partners apply on the partner page", async ({ page }) => {
    await page.goto("/partners");
    await page.getByLabel("Your name").fill("Bea Broker");
    await page.getByLabel("Work email").fill(LEAD_EMAIL);
    await page.getByRole("textbox", { name: "Company" }).fill("Bea Realty");
    await page.getByLabel("What best describes you?").selectOption("Real estate broker");
    await page.getByRole("button", { name: "Apply to partner" }).click();
    await expect(page.getByText("Thank you for applying!")).toBeVisible();
    await expect
      .poll(() => db.websiteLead.count({ where: { email: LEAD_EMAIL, kind: "PARTNER" } }))
      .toBe(1);
  });

  test("the status page says whether things are working, with words", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByRole("heading", { name: "Database" })).toBeVisible();
    await expect(page.getByText("Working").first()).toBeVisible();
  });

  test("each property type page shows its standard reminders", async ({ page }) => {
    await page.goto("/for/industrial");
    await expect(page.getByText("180 days before the lease ends")).toBeVisible();
    await page.goto("/");
    await page
      .getByRole("link", { name: /Residential/ })
      .first()
      .click();
    await expect(page.getByText("7 days before the lease ends")).toBeVisible();
  });
});
