import { expect, test } from "@playwright/test";

import { signInAs } from "./fixtures";

test("the menu works on a phone", async ({ page }) => {
  await signInAs(page, "staff");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Units" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Units" })).toBeVisible();
  // No horizontal scrolling.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
