import { expect, test, type Page } from "@playwright/test";

import {
  archiveQaLease,
  createQaLease,
  ensureQaUnit,
  hasCredentials,
  manilaToday,
  QA_LABEL,
  signIn,
  watchForErrors,
} from "./helpers";

/**
 * Trying to break Propfolio the way a good QA tester would: bad and hostile input, double
 * clicks, odd addresses, oversized files. Everything created is labelled "QA Robot" and archived.
 * A failing check here is a finding to fix, not a flaky test.
 */
const HOSTILE = [
  "' OR '1'='1' --",
  '"; DROP TABLE "Lease"; --',
  "<script>alert('xss')</script>",
  "<img src=x onerror=alert(1)>",
  "%",
  "_",
  "\\",
  "{{7*7}}",
  "${7*7}",
  "😀🏢 Ñoño Café",
  "a".repeat(600),
];

function failOnDialog(page: Page): string[] {
  const popped: string[] = [];
  page.on("dialog", async (d) => {
    popped.push(d.message());
    await d.dismiss();
  });
  return popped;
}

test.describe("@abuse signed out", () => {
  test("hostile and oversized sign-in attempts get the normal message, never an error", async ({
    page,
  }) => {
    const problems = watchForErrors(page);
    for (const [email, password] of [
      ["' OR '1'='1' --@x.com", "' OR 1=1 --"],
      ["admin@propfolio.test'--", "x"],
      [`${"a".repeat(300)}@example.com`, "b".repeat(5000)],
      ["not-an-email", "whatever-password"],
    ]) {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email!);
      await page.getByLabel("Password", { exact: true }).fill(password!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("alert").first()).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test("password reset never reveals whether an email has an account", async ({ page }) => {
    const messages: string[] = [];
    for (const email of ["nobody-qa-robot@example.com", "admin@propfolio.test"]) {
      await page.goto("/login");
      await page.getByRole("link", { name: /Forgot/ }).click();
      await page.waitForURL(/\/forgot-password/);
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me a link" }).click();
      await expect(page.getByText("Check your email")).toBeVisible();
      messages.push((await page.locator("main").innerText()).replace(email, "<email>"));
    }
    expect(messages[0]).toBe(messages[1]);
  });
});

test.describe("@abuse signed in", () => {
  test.skip(!hasCredentials, "Set QA_EMAIL and QA_PASSWORD (an Admin account) to run");

  // Leases a failed check left behind are archived, so the QA unit is free for the next check.
  const cleanup: [string, string][] = [];
  test.afterEach(async ({ page }) => {
    while (cleanup.length) {
      const [url, tenant] = cleanup.pop()!;
      await archiveQaLease(page, url, tenant).catch(() => undefined);
    }
  });

  test("search boxes survive hostile text", async ({ page }) => {
    const problems = watchForErrors(page);
    const popped = failOnDialog(page);
    await signIn(page);
    for (const q of HOSTILE) {
      for (const base of ["/leases", "/tenants"]) {
        const r = await page.goto(`${base}?q=${encodeURIComponent(q)}`);
        expect(r?.status(), `${base} q=${q.slice(0, 30)}`).toBeLessThan(500);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      }
    }
    expect(popped, "a script ran from a search").toEqual([]);
    expect(problems).toEqual([]);
  });

  test("odd report filters and API parameters are handled", async ({ page }) => {
    const problems = watchForErrors(page);
    await signIn(page);
    for (const qs of [
      "from=2026-13-45&to=abc",
      "from=2027-01-01&to=2020-01-01",
      "building=not-a-uuid&unitType='--",
      "days=-5",
      "days=999999",
      "from=" + "9".repeat(500),
    ]) {
      for (const report of ["collections", "renewals", "expiry"]) {
        const r = await page.goto(`/reports/${report}?${qs}`);
        expect(r?.status(), `${report}?${qs}`).toBeLessThan(500);
      }
      const ex = await page.request.get(`/api/v1/reports/collections/export?format=csv&${qs}`);
      expect(ex.status(), `export ${qs}`).toBeLessThan(500);
    }
    for (const qs of ["from=bad&to=bad", "from=2026-01-01&to=2030-01-01", "from=2026-01-01", ""]) {
      const r = await page.request.get(`/api/v1/calendar?${qs}`);
      expect(r.status(), `calendar ${qs}`).toBeGreaterThanOrEqual(200);
      expect(r.status(), `calendar ${qs}`).toBeLessThan(500);
    }
    expect(problems).toEqual([]);
  });

  test("a tenant named with script code is shown as plain text, never run", async ({ page }) => {
    const problems = watchForErrors(page);
    const popped = failOnDialog(page);
    await signIn(page);
    const name = `${QA_LABEL} <img src=x onerror=alert(1)> ${Date.now()}`;
    await page.goto("/tenants/new");
    await page.getByLabel("Display name", { exact: true }).fill(name);
    await page
      .getByLabel("Notes", { exact: true })
      .fill("<script>alert('notes')</script>\n" + "Long note. ".repeat(80));
    await page.getByLabel("Email", { exact: true }).fill("not-an-email");
    await page
      .getByLabel("The tenant has received and acknowledged the privacy notice.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Add tenant" }).click();
    await expect(page.getByText(/valid email/i).first()).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("");
    await page.getByLabel("TIN", { exact: true }).fill("12-ABC");
    await page.getByRole("button", { name: "Add tenant" }).click();
    await expect(page.getByText(/TIN/).nth(1)).toBeVisible();
    await page.getByLabel("TIN", { exact: true }).fill("");
    await page.getByRole("button", { name: "Add tenant" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "<img src=x onerror=alert(1)>",
    );
    for (const path of ["/tenants", `/tenants?q=${encodeURIComponent(QA_LABEL)}`]) {
      await page.goto(path);
    }
    expect(popped, "a script ran from tenant data").toEqual([]);
    await page.getByRole("link", { name: name }).first().click();
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Tenant archived")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("lease form refuses impossible terms", async ({ page }) => {
    await signIn(page);
    await ensureQaUnit(page);
    await page.goto("/leases/new");
    const restart = page.getByRole("button", { name: /Start over|Start a new lease/ });
    if (await restart.isVisible({ timeout: 1000 }).catch(() => false)) await restart.click();
    await page.getByRole("radio", { name: new RegExp(`Unit QA-1 ${QA_LABEL}`) }).check();
    await page.getByRole("button", { name: "Next: Tenant" }).click();
    await page.getByRole("button", { name: "Add a new tenant" }).click();
    await page
      .getByLabel("Display name", { exact: true })
      .fill(`${QA_LABEL} Bad Terms ${Date.now()}`);
    await page
      .getByLabel("The tenant has received and acknowledged the privacy notice.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Add tenant and continue" }).click();

    const next = () => page.getByRole("button", { name: "Next: Review and save" }).click();
    const fill = async (start: string, end: string, rent: string, day: string, deposit = "0") => {
      await page.getByLabel("First day of the lease", { exact: true }).fill(start);
      await page.getByLabel("Last day of the lease", { exact: true }).fill(end);
      await page.getByLabel("Monthly rent", { exact: true }).fill(rent);
      await page.getByLabel("Rent due on day", { exact: true }).fill(day);
      await page.getByLabel("Security deposit", { exact: true }).fill(deposit);
      await next();
    };
    const cases: [string, string, string, string, string, RegExp][] = [
      [manilaToday(30), manilaToday(-30), "10000", "5", "0", /end date must be after/i],
      [manilaToday(0), manilaToday(365), "abc", "5", "0", /rent/i],
      [manilaToday(0), manilaToday(365), "-5000", "5", "0", /rent/i],
      [manilaToday(0), manilaToday(365), "0", "5", "0", /rent/i],
      [manilaToday(0), manilaToday(365), "1.234", "5", "0", /decimal|centavo|rent/i],
      [manilaToday(0), manilaToday(365), "999999999999999", "5", "0", /rent|large|amount/i],
      [manilaToday(0), manilaToday(365), "10000", "0", "0", /day from 1 to 28/i],
      [manilaToday(0), manilaToday(365), "10000", "31", "0", /day from 1 to 28/i],
      [manilaToday(0), manilaToday(365), "10000", "5", "-1", /deposit/i],
    ];
    for (const [s, e, rent, day, dep, msg] of cases) {
      await fill(s, e, rent, day, dep);
      await expect(
        page.getByText(/Step 3 of 4/),
        `should stay on terms for rent=${rent} day=${day} dep=${dep}`,
      ).toBeVisible();
      await expect(
        page.getByText(msg).first(),
        `message for rent=${rent} day=${day} dep=${dep}`,
      ).toBeVisible();
    }
    // Leave without saving; the draft is discarded next time.
  });

  test("payments: bad amounts are refused; a double-click records only one payment", async ({
    page,
  }) => {
    const problems = watchForErrors(page);
    await signIn(page);
    await ensureQaUnit(page);
    const tenant = `${QA_LABEL} Payments ${Date.now()}`;
    const leaseUrl = await createQaLease(page, tenant);
    cleanup.push([leaseUrl, tenant]);
    await page.getByRole("tab", { name: "Payments" }).click();
    await page.getByRole("link", { name: "Record payment" }).first().click();

    for (const amount of ["0", "-100", "abc", "1.239", "999999999999999"]) {
      await page.getByLabel("Amount received", { exact: true }).fill(amount);
      await page.getByRole("button", { name: "Record payment" }).click();
      await expect(page, `amount ${amount} must not save`).toHaveURL(/\/payments\/new/);
    }
    await page.getByLabel("Amount received", { exact: true }).fill("5,000");
    await page.getByLabel("Date received", { exact: true }).fill(manilaToday(10));
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/future/i).first()).toBeVisible();
    await page.getByLabel("Date received", { exact: true }).fill(manilaToday(0));

    // Rapid double (triple) click.
    const save = page.getByRole("button", { name: "Record payment" });
    await save.click({ clickCount: 3, delay: 30 });
    await expect(page.getByText("Acknowledgement — not an official receipt")).toBeVisible();
    await page.goto(leaseUrl);
    await page.getByRole("tab", { name: "Payments" }).click();
    const received = page.getByRole("link", { name: /^PAY-\d{4}-\d{4}$/ });
    await expect(received, "a triple-click must create exactly one payment").toHaveCount(1);

    // Over-payment becomes credit, not an error.
    await page.getByRole("link", { name: "Record payment" }).first().click();
    await page.getByLabel("Amount received", { exact: true }).fill("10,000,000");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/credit/i).first()).toBeVisible();

    await archiveQaLease(page, leaseUrl, tenant);
    cleanup.pop();
    expect(problems).toEqual([]);
  });

  test("a double-clicked Save lease creates one lease, not two", async ({ page }) => {
    await signIn(page);
    await ensureQaUnit(page);
    const tenant = `${QA_LABEL} DoubleSave ${Date.now()}`;
    await page.goto("/leases/new");
    const restart = page.getByRole("button", { name: /Start over|Start a new lease/ });
    if (await restart.isVisible({ timeout: 1000 }).catch(() => false)) await restart.click();
    await page.getByRole("radio", { name: new RegExp(`Unit QA-1 ${QA_LABEL}`) }).check();
    await page.getByRole("button", { name: "Next: Tenant" }).click();
    await page.getByRole("button", { name: "Add a new tenant" }).click();
    await page.getByLabel("Display name", { exact: true }).fill(tenant);
    await page
      .getByLabel("The tenant has received and acknowledged the privacy notice.", { exact: true })
      .check();
    await page.getByRole("button", { name: "Add tenant and continue" }).dblclick();
    await page.getByLabel("First day of the lease", { exact: true }).fill(manilaToday(1));
    await page.getByLabel("Last day of the lease", { exact: true }).fill(manilaToday(200));
    await page.getByLabel("Monthly rent", { exact: true }).fill("20,000");
    await page.getByLabel("Rent due on day", { exact: true }).fill("5");
    await page.getByLabel("Security deposit", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Next: Review and save" }).click();
    await page.getByRole("button", { name: "Save lease" }).click({ clickCount: 3, delay: 30 });
    await expect(page.getByRole("heading", { level: 1, name: tenant })).toBeVisible();
    const leaseUrl = page.url();
    cleanup.push([leaseUrl, tenant]);
    await page.goto(`/leases?q=${encodeURIComponent(tenant)}`);
    await expect(
      page.getByRole("link", { name: /^LSE-\d{4}-\d{4}$/ }),
      "one lease only",
    ).toHaveCount(1);
    await page.goto(`/tenants?q=${encodeURIComponent(tenant)}`);
    await expect(page.getByRole("link", { name: tenant }), "one tenant only").toHaveCount(1);
    await archiveQaLease(page, leaseUrl, tenant);
    cleanup.pop();
  });

  test("uploads: disguised, empty, oversized and path-trick files are handled", async ({
    page,
  }) => {
    await signIn(page);
    await ensureQaUnit(page);
    const tenant = `${QA_LABEL} Uploads ${Date.now()}`;
    const leaseUrl = await createQaLease(page, tenant);
    cleanup.push([leaseUrl, tenant]);
    await page.getByRole("tab", { name: "Documents" }).click();
    const upload = async (name: string, mimeType: string, buffer: Buffer) => {
      await page.locator("#doc-file").setInputFiles({ name, mimeType, buffer });
      await page.getByRole("button", { name: "Upload document" }).click();
    };
    await upload("invoice.pdf", "application/pdf", Buffer.from([0x4d, 0x5a, 0x90, 0, 3]));
    await expect(page.getByText(/Only PDF, JPG, PNG or Word/)).toBeVisible();
    await upload(
      "page.pdf",
      "application/pdf",
      Buffer.from("<html><script>alert(1)</script></html>"),
    );
    await expect(page.getByText(/Only PDF, JPG, PNG or Word/)).toBeVisible();
    await upload("empty.pdf", "application/pdf", Buffer.alloc(0));
    await expect(page.getByText(/Choose a file|empty|Only PDF/i).first()).toBeVisible();
    // Too big: refused as soon as it's chosen…
    const big = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(21 * 1024 * 1024, 0x20)]);
    await page
      .locator("#doc-file")
      .setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: big });
    await expect(page.getByText(/larger than 20 MB/).first()).toBeVisible();
    // …and by the server too, for anyone who skips the page.
    const direct = await page.request.post("/api/v1/documents", {
      headers: { Origin: new URL(page.url()).origin },
      multipart: {
        category: "OTHER",
        leaseId: leaseUrl.split("/").pop()!,
        file: { name: "big.pdf", mimeType: "application/pdf", buffer: big },
      },
    });
    expect(direct.status(), "server refuses files over 20 MB").toBeGreaterThanOrEqual(400);
    expect(direct.status()).toBeLessThan(500);
    await upload("../../etc/passwd.pdf", "application/pdf", Buffer.from("%PDF-1.7\n%%EOF"));
    await expect(page.getByText("Document uploaded ✓")).toBeVisible();
    await expect(page.getByText("passwd.pdf", { exact: true })).toBeVisible();
    await expect(page.getByText("../")).toHaveCount(0);
    await archiveQaLease(page, leaseUrl, tenant);
    cleanup.pop();
  });

  test("forms keep working after Back, Refresh and two open tabs", async ({ page, context }) => {
    const problems = watchForErrors(page);
    await signIn(page);
    await page.goto("/payments/new");
    await page.goBack();
    await page.goForward();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const second = await context.newPage();
    await second.goto("/leases");
    await expect(second.getByRole("heading", { level: 1, name: "Leases" })).toBeVisible();
    await second.close();
    expect(problems).toEqual([]);
  });
});
