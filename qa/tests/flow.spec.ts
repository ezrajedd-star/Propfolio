import { expect, test } from "@playwright/test";

import { hasCredentials, manilaToday, QA_LABEL, signIn, watchForErrors } from "./helpers";

/**
 * One full working day, end to end. It CREATES data, all labelled "QA Robot":
 * a building "QA Robot (automated checks)" with unit QA-1 (made once, then reused), and each run
 * a tenant and a lease that are archived at the end, so testers don't see them in normal lists.
 * Emails: none are sent to real people (the lease doesn't end soon; QA addresses are demo ones).
 */
test.describe("@flow a lease from start to finish", () => {
  test.skip(!hasCredentials, "Set QA_EMAIL and QA_PASSWORD (an Admin account) to run");
  test.describe.configure({ mode: "serial" });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const tenantName = `${QA_LABEL} Tenant ${stamp}`;
  const buildingName = `${QA_LABEL} (automated checks)`;

  test("set up: the QA building and unit exist", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings/buildings");
    if (await page.getByRole("link", { name: buildingName }).count()) return;
    await page.getByRole("button", { name: "Add building" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Building name", { exact: true }).fill(buildingName);
    await dialog.getByLabel("Short code", { exact: true }).fill("QAR");
    await dialog.getByLabel("Address", { exact: true }).fill("For automated checks only");
    await dialog.getByRole("button", { name: "Add building" }).click();
    await expect(page.getByRole("heading", { level: 1, name: buildingName })).toBeVisible();
    await page.getByRole("button", { name: "Add unit" }).first().click();
    await page.getByRole("dialog").getByLabel("Unit number or name", { exact: true }).fill("QA-1");
    await page.getByRole("dialog").getByRole("button", { name: "Add unit" }).click();
    await expect(page.getByText("Unit QA-1 added ✓")).toBeVisible();
  });

  test("create a lease with a new tenant, record and void a payment, upload a document, then clean up", async ({
    page,
  }) => {
    const problems = watchForErrors(page);
    await signIn(page);

    // New lease: unit → new tenant → terms → review.
    await page.goto("/leases/new");
    const restart = page.getByRole("button", { name: /Start over|Start a new lease/ });
    if (await restart.isVisible({ timeout: 1000 }).catch(() => false)) await restart.click();
    await page.getByRole("radio", { name: new RegExp(`Unit QA-1 ${QA_LABEL}`) }).check();
    await page.getByRole("button", { name: "Next: Tenant" }).click();
    await page.getByRole("button", { name: "Add a new tenant" }).click();
    await page.getByLabel("Display name", { exact: true }).fill(tenantName);
    await page.getByLabel("Contact person", { exact: true }).fill("QA Contact");
    await page
      .getByLabel("The tenant has received and acknowledged the privacy notice.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Add tenant and continue" }).click();
    await page.getByLabel("First day of the lease", { exact: true }).fill(manilaToday(-45));
    await page.getByLabel("Last day of the lease", { exact: true }).fill(manilaToday(320));
    await page.getByLabel("Monthly rent", { exact: true }).fill("12,345");
    await page.getByLabel("Rent due on day", { exact: true }).fill("5");
    await page.getByLabel("Security deposit", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Next: Review and save" }).click();
    await expect(page.getByText(/Rent is ₱12,345\.00 a month/)).toBeVisible();
    await page.getByRole("button", { name: "Save lease" }).click();
    await expect(page.getByRole("heading", { level: 1, name: tenantName })).toBeVisible();
    const leaseUrl = page.url();

    // Charges were made; the lease is overdue.
    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByText("Overdue").first()).toBeVisible();

    // Record a payment.
    await page.getByRole("link", { name: "Record payment" }).first().click();
    await page.getByLabel("Amount received", { exact: true }).fill("12,345");
    await page.getByLabel("Reference", { exact: true }).fill(`QA-${stamp}`);
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Acknowledgement — not an official receipt")).toBeVisible();

    // Void it.
    await page.getByRole("button", { name: "Void payment" }).click();
    await page.getByRole("dialog").getByLabel("Reason").fill("Automated QA check");
    await page.getByRole("dialog").getByRole("button", { name: "Void payment" }).click();
    await expect(page.getByText(/voided/i).first()).toBeVisible();

    // Upload, open and remove a document.
    await page.goto(leaseUrl);
    await page.getByRole("tab", { name: "Documents" }).click();
    await page.locator("#doc-file").setInputFiles({
      name: "QA check.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF"),
    });
    await page.getByRole("button", { name: "Upload document" }).click();
    await expect(page.getByText("Document uploaded ✓")).toBeVisible();
    const href = await page.getByRole("link", { name: "Open QA check.pdf" }).getAttribute("href");
    const file = await page.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("application/pdf");
    await page.getByRole("button", { name: "Remove QA check.pdf" }).click();
    await page.getByRole("dialog").getByLabel("Reason").fill("Automated QA check");
    await page.getByRole("dialog").getByRole("button", { name: "Remove document" }).click();
    await expect(page.getByText("Document removed")).toBeVisible();

    // Clean up: archive the lease, then the tenant.
    await page.goto(leaseUrl);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(page.getByText("Archived").first()).toBeVisible();
    await page.getByRole("link", { name: tenantName }).first().click();
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Tenant archived")).toBeVisible();

    expect(problems).toEqual([]);
  });
});
