import { expect, test } from "@playwright/test";

import { expectNoErrorPage, hasCredentials, signIn, watchForErrors } from "./helpers";

/** Read-only checks. Safe to run any time; they change no data. */
test.describe("@smoke site and security basics", () => {
  test("health check answers", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    expect(await r.json()).toMatchObject({ status: "ok" });
  });

  test("plain http is sent to https", async ({ request, baseURL }) => {
    test.skip(!baseURL!.startsWith("https://"), "Only for https sites");
    const r = await request.get(baseURL!.replace("https://", "http://") + "/login", {
      maxRedirects: 0,
    });
    expect([301, 302, 307, 308]).toContain(r.status());
    expect(r.headers()["location"]).toMatch(/^https:\/\//);
  });

  test("security headers are present", async ({ request, baseURL }) => {
    const h = (await request.get("/login")).headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["x-powered-by"]).toBeUndefined();
    if (baseURL!.startsWith("https://"))
      expect(h["strict-transport-security"]).toContain("max-age=");
  });

  test("signed-out visitors can't see anything", async ({ page, request }) => {
    for (const path of ["/", "/leases", "/payments", "/reports", "/settings/users", "/tenants"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
    for (const path of [
      "/api/v1/me",
      "/api/v1/calendar?from=2026-01-01&to=2026-02-01",
      "/api/v1/leases/export",
      "/api/v1/payments/overdue/export",
      "/api/v1/reports/rent-roll/export",
      "/api/v1/audit-log",
      "/api/v1/feedback/export",
    ]) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(401);
    }
  });

  test("a wrong password gets a plain message that reveals nothing", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody-qa@example.com");
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /email and password don.t match/i }),
    ).toBeVisible();
  });

  test("requests from other websites are blocked", async ({ request }) => {
    const r = await request.post("/api/v1/session/ping", {
      headers: { Origin: "https://evil.example" },
    });
    expect([401, 403]).toContain(r.status());
  });
});

test.describe("@smoke signed in: every screen opens", () => {
  test.skip(!hasCredentials, "Set QA_EMAIL and QA_PASSWORD to run signed-in checks");

  test("session cookie is locked down", async ({ page, baseURL }) => {
    await signIn(page);
    const cookie = (await page.context().cookies()).find((c) =>
      c.name.includes("propfolio_session"),
    );
    expect(cookie).toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    if (baseURL!.startsWith("https://")) {
      expect(cookie!.secure).toBe(true);
      expect(cookie!.name.startsWith("__Host-")).toBe(true);
    }
  });

  test("main screens, reports and settings load without errors", async ({ page }) => {
    const problems = watchForErrors(page);
    await signIn(page);
    const pages = [
      "/",
      "/calendar",
      "/leases",
      "/units",
      "/tenants",
      "/payments",
      "/payments/new",
      "/reports",
      "/reports/expiry",
      "/reports/occupancy",
      "/reports/rent-roll",
      "/reports/collections",
      "/reports/aging",
      "/reports/renewals",
      "/settings",
      "/settings/users",
      "/settings/general",
      "/settings/buildings",
      "/settings/unit-types",
      "/settings/reminder-emails",
      "/settings/privacy",
      "/settings/audit-log",
      "/settings/feedback",
    ];
    for (const path of pages) {
      await page.goto(path);
      await expectNoErrorPage(page);
    }
    expect(problems).toEqual([]);
  });

  test("a lease page opens with all its tabs", async ({ page }) => {
    const problems = watchForErrors(page);
    await signIn(page);
    await page.goto("/leases");
    await page
      .getByRole("link", { name: /^LSE-\d{4}-\d{4}$/ })
      .first()
      .click();
    for (const tab of ["Overview", "Payments", "Documents", "Reminders", "History"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test("the Guide turns on and off", async ({ page }) => {
    await signIn(page);
    await page.goto("/payments");
    await page.getByRole("button", { name: "Guide", exact: true }).first().click();
    const guide = page.getByRole("complementary", { name: "Guide" });
    await expect(guide.getByRole("heading", { name: "Payments" })).toBeVisible();
    // The Guide is a saved setting, saved in the background: wait for it, or the panel comes back
    // and covers buttons in later checks.
    const saved = page.waitForResponse(
      (r) => r.request().postData()?.includes('"on":false') ?? false,
    );
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    await saved;
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(guide).toHaveCount(0);
  });

  test("reports download for Excel", async ({ page }) => {
    await signIn(page);
    await page.goto("/reports/rent-roll");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download for Excel" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe("@smoke @phone on a phone", () => {
  test("sign-in page fits the screen", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
