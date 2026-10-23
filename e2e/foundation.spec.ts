import { expect, test } from "@playwright/test";

import { PASSWORD, USERS, signIn, signInAs } from "./fixtures";

// Next.js adds an empty role="alert" route announcer; match our form alerts by text instead.
const formAlert = (page: import("@playwright/test").Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

test.describe("Phase 1 acceptance", () => {
  test("Admin creates a user, who must set a new password at first sign-in", async ({
    page,
    browser,
  }) => {
    await signInAs(page, "admin");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("link", { name: /Users/ }).click();
    await page.getByRole("button", { name: "Add user" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("Nina New");
    await dialog.getByLabel("Work email").fill("Nina.New@E2E.test");
    await dialog.getByText("Property Management (Viewer)").click();
    await dialog.getByRole("button", { name: "Add user" }).click();

    await expect(dialog.getByRole("heading", { name: "Nina New can now sign in" })).toBeVisible();
    const temporaryPassword = (await dialog
      .getByTestId("temporary-password")
      .textContent())!.trim();
    await dialog.getByRole("button", { name: "Done" }).click();
    const row = page.getByRole("row", { name: /Nina New/ });
    await expect(row).toContainText("nina.new@e2e.test");
    await expect(row).toContainText("Hasn't signed in yet");

    // The new user signs in in a separate browser.
    const context = await browser.newContext();
    const newUser = await context.newPage();
    await signIn(newUser, "nina.new@e2e.test", temporaryPassword);
    await expect(newUser).toHaveURL(/\/change-password$/);
    await expect(newUser.getByRole("heading", { name: "Welcome, Nina New" })).toBeVisible();

    // Can't skip the password change by going elsewhere.
    await newUser.goto("/units");
    await expect(newUser).toHaveURL(/\/change-password$/);
    const api = await newUser.request.get("/api/v1/me");
    expect(api.status()).toBe(403);
    expect((await api.json()).error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    await newUser.getByLabel("Temporary password").fill(temporaryPassword);
    await newUser.getByLabel("New password", { exact: true }).fill("short");
    await newUser.getByLabel("Type the new password again").fill("short");
    await newUser.getByRole("button", { name: "Save new password" }).click();
    await expect(newUser.getByText(/at least 10 characters/i).first()).toBeVisible();

    await newUser.getByLabel("New password", { exact: true }).fill("my own long password");
    await newUser.getByLabel("Type the new password again").fill("my own long password");
    await newUser.getByRole("button", { name: "Save new password" }).click();
    await expect(newUser).toHaveURL("/");
    await expect(newUser.getByText("Your new password is saved ✓")).toBeVisible();
    await context.close();
  });

  test("Five wrong passwords lock the account", async ({ page }) => {
    for (let i = 0; i < 4; i++) {
      await signIn(page, USERS.lockme.email, `wrong password ${i}`);
      await expect(formAlert(page, "don't match")).toBeVisible();
    }
    await signIn(page, USERS.lockme.email, "wrong password 5");
    await expect(formAlert(page, "locked for 15 minutes")).toBeVisible();

    // The right password is refused while locked.
    await signIn(page, USERS.lockme.email, PASSWORD);
    await expect(formAlert(page, "locked for 15 minutes")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // An Admin sees the lock and can lift it.
    await signInAs(page, "admin");
    await page.goto("/settings/users");
    const row = page.getByRole("row", { name: /Lou Locked/ });
    await expect(row).toContainText("Locked until");
    await row.getByRole("button", { name: "Actions for Lou Locked" }).click();
    await page.getByRole("menuitem", { name: "Unlock" }).click();
    await expect(row).toContainText("Active");
  });

  test("Viewers only see their screens and are refused everywhere else", async ({ page }) => {
    await signInAs(page, "viewer");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveText(["Home", "Calendar", "Units"]);

    for (const path of [
      "/leases",
      "/tenants",
      "/payments",
      "/reports",
      "/settings",
      "/settings/users",
      "/settings/audit-log",
      "/settings/general",
    ]) {
      await page.goto(path);
      await expect(page, `viewer must not open ${path}`).toHaveURL(/\/no-access$/);
    }

    for (const path of [
      "/api/v1/users",
      "/api/v1/audit-log",
      `/api/v1/users/00000000-0000-7000-8000-000000000000`,
    ]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(403);
    }
    const origin = new URL(page.url()).origin;
    const create = await page.request.post("/api/v1/users", {
      data: { name: "Sneaky", email: "sneaky@e2e.test", role: "ADMIN" },
      headers: { Origin: origin },
    });
    expect(create.status()).toBe(403);
  });

  test("Leasing Staff cannot reach admin pages or APIs", async ({ page }) => {
    await signInAs(page, "staff");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await page.goto("/settings/users");
    await expect(page).toHaveURL(/\/no-access$/);
    expect((await page.request.get("/api/v1/users")).status()).toBe(403);
    expect((await page.request.get("/api/v1/audit-log")).status()).toBe(403);
  });

  test("Signed-out visitors are sent to sign in, and APIs say 401", async ({ page }) => {
    await page.goto("/settings/users");
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  });

  test("Cross-site requests that change data are blocked", async ({ page }) => {
    await signInAs(page, "admin");
    const res = await page.request.post("/api/v1/users", {
      data: { name: "Evil", email: "evil@e2e.test", role: "ADMIN" },
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
  });

  test("Audit log records sign-ins and is visible to Admins", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/settings/audit-log");
    await expect(page.getByRole("cell", { name: "Signed in" }).first()).toBeVisible();
    await page.getByLabel("What happened").selectOption({ label: "Failed sign-in" });
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Reason: wrong password").first()).toBeVisible();
  });

  test("Signing out ends the session", async ({ page }) => {
    await signInAs(page, "staff");
    await page.getByRole("button", { name: /Sam Staff/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed-out/);
    await expect(page.getByText("You have been signed out.")).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});
