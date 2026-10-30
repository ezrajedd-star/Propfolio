import { expect, test } from "@playwright/test";

import { hasCredentials, signIn } from "./helpers";

/** How long the common clicks take on the real server. Over 2 s is flagged; over 6 s fails. */
test.describe("@speed time from click to the next screen", () => {
  test.skip(!hasCredentials, "Set QA_EMAIL and QA_PASSWORD to run");

  test("main buttons and menu items", async ({ page }) => {
    await signIn(page);
    const timings: { action: string; ms: number }[] = [];
    const time = async (
      action: string,
      from: string,
      click: () => Promise<void>,
      until: RegExp,
    ) => {
      await page.goto(from);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const t0 = Date.now();
      await click();
      await page.waitForURL(until);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      timings.push({ action, ms: Date.now() - t0 });
    };
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await time(
      "Leases → New lease",
      "/leases",
      () => page.getByRole("link", { name: "New lease" }).first().click(),
      /\/leases\/new/,
    );
    await time(
      "Payments → Record payment",
      "/payments",
      () => page.getByRole("link", { name: "Record payment" }).first().click(),
      /\/payments\/new/,
    );
    await time(
      "Tenants → Add tenant",
      "/tenants",
      () =>
        page
          .getByRole("link", { name: /Add tenant/ })
          .first()
          .click(),
      /\/tenants\/new/,
    );
    await time(
      "Menu → Leases",
      "/",
      () => nav.getByRole("link", { name: "Leases" }).click(),
      /\/leases$/,
    );
    await time(
      "Menu → Calendar",
      "/",
      () => nav.getByRole("link", { name: "Calendar" }).click(),
      /\/calendar/,
    );
    await time(
      "Menu → Payments",
      "/",
      () => nav.getByRole("link", { name: "Payments" }).click(),
      /\/payments$/,
    );
    await time(
      "Menu → Reports",
      "/",
      () => nav.getByRole("link", { name: "Reports" }).click(),
      /\/reports$/,
    );
    await time(
      "Reports → Rent roll",
      "/reports",
      () => page.getByRole("link", { name: /Rent roll/ }).click(),
      /\/reports\/rent-roll/,
    );
    await time(
      "Leases → open a lease",
      "/leases",
      () =>
        page
          .getByRole("link", { name: /^LSE-\d{4}-\d{4}$/ })
          .first()
          .click(),
      /\/leases\/[0-9a-f-]{36}/,
    );

    const table = timings
      .map((t) => `${t.ms > 2000 ? "SLOW " : "ok   "}${String(t.ms).padStart(6)} ms  ${t.action}`)
      .join("\n");
    console.log(`\nTime from click to next screen:\n${table}\n`);
    await test.info().attach("timings.txt", { body: table, contentType: "text/plain" });
    for (const t of timings) expect.soft(t.ms, t.action).toBeLessThan(6000);
  });
});
