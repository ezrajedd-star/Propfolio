import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_DATABASE_URL } from "../playwright.config";
import { signInAs, USERS } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.describe("Phase 6: guide, documents, reports, feedback", () => {
  test("the welcome tour starts by itself the first time, and only once", async ({ page }) => {
    const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
    const viewer = await db.user.findUniqueOrThrow({ where: { email: USERS.viewer.email } });
    await db.userPreference.deleteMany({ where: { userId: viewer.id, key: "guide" } });
    await db.$disconnect();

    await signInAs(page, "viewer");
    const tour = page.getByRole("dialog");
    await expect(tour.getByRole("heading", { name: "Welcome to Propfolio, Vic" })).toBeVisible();
    await tour.getByRole("button", { name: "Show me around" }).click();
    await expect(tour.getByText(/Step 2 of \d/)).toBeVisible();
    await expect(tour.getByRole("heading", { name: "Home" })).toBeVisible();
    // Viewers' tour never mentions money screens.
    while (await tour.getByRole("button", { name: "Next" }).isVisible()) {
      await expect(tour).not.toContainText("Payments");
      await tour.getByRole("button", { name: "Next" }).click();
    }
    // The test version ends with the feedback button.
    await expect(tour.getByRole("heading", { name: "Tell us what you think" })).toBeVisible();
    await tour.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Guide shows plain notes for the buttons on the current page", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/payments");
    await page.getByRole("button", { name: "Guide", exact: true }).click();
    const guide = page.getByRole("complementary", { name: "Guide" });
    await expect(guide.getByRole("heading", { name: "Payments" })).toBeVisible();
    await expect(guide.getByText("Record payment", { exact: true })).toBeVisible();
    await expect(guide.getByText("Overdue list", { exact: true })).toBeVisible();

    // It stays on while moving around, and explains the new page.
    await page.goto("/leases");
    await expect(guide.getByRole("heading", { name: "Leases" })).toBeVisible();
    await expect(guide.getByText("Search", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);

    // Replay the tour from the account menu.
    await page.getByRole("button", { name: /Sam Staff/ }).click();
    await page.getByRole("menuitem", { name: "Take the tour again" }).click();
    await expect(page.getByRole("dialog").getByText("Welcome to Propfolio, Sam")).toBeVisible();
    await page.getByRole("button", { name: "Skip tour" }).click();
  });

  test("upload a document to a lease and open it", async ({ page }) => {
    await signInAs(page, "staff");
    await page.goto("/leases?q=overdue");
    await page.getByRole("link", { name: "LSE-E2E-0002" }).click();
    await page.getByRole("tab", { name: "Documents" }).click();
    await page.getByLabel("What is it?").selectOption("SIGNED_CONTRACT");
    await page.locator("#doc-file").setInputFiles({
      name: "Signed lease.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF"),
    });
    await page.getByRole("button", { name: "Upload document" }).click();
    await expect(page.getByText("Document uploaded ✓")).toBeVisible();
    await expect(page.getByText("Signed lease.pdf")).toBeVisible();

    const res = await page.request.get(
      (await page.getByRole("link", { name: "Open Signed lease.pdf" }).getAttribute("href"))!,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // A renamed program is refused.
    await page.locator("#doc-file").setInputFiles({
      name: "invoice.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0]),
    });
    await page.getByRole("button", { name: "Upload document" }).click();
    await expect(
      page.getByText("Only PDF, JPG, PNG or Word (DOCX) files can be uploaded."),
    ).toBeVisible();
  });

  test("reports: open, filter and download", async ({ page }) => {
    await signInAs(page, "staff");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Reports" })
      .click();
    await page.getByRole("link", { name: /Rent roll/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rent roll" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Overdue Trading Inc." })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download for Excel" }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^propfolio-rent-roll-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );

    await page.goto("/reports/aging");
    await expect(page.getByRole("cell", { name: "Overdue Trading Inc." })).toBeVisible();
  });

  test("testers send feedback; Admins see it with the page it came from", async ({ page }) => {
    await signInAs(page, "staff");
    await expect(page.getByText(/Test version — the data here is made up/)).toBeVisible();
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await page.getByLabel("Your feedback").fill("The calendar needs a 'today' button on phones.");
    await page.getByRole("dialog").getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText("Thank you! Your feedback was sent.")).toBeVisible();

    await page.context().clearCookies();
    await signInAs(page, "admin");
    await page.goto("/settings/feedback");
    const item = page.getByRole("listitem").filter({ hasText: "today' button on phones" });
    await expect(item).toContainText("Sam Staff");
    await expect(item).toContainText("/calendar");
    await item.getByRole("button", { name: "Mark as done" }).click();
    await expect(page.getByText("Nothing left to do")).toBeVisible();
  });
});
