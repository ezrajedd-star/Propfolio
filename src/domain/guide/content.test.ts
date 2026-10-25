import { describe, expect, it } from "vitest";

import { GUIDE_HINTS, pageIntro, tourSteps } from "./content";

describe("tourSteps", () => {
  it.each([
    ["ADMIN", true, ["nav-settings", "guide-button", "feedback-button"]],
    ["LEASING_STAFF", false, ["nav-payments", "guide-button"]],
    ["VIEWER", false, ["nav-units", "guide-button"]],
  ] as const)("%s (UAT %s) points at real guide targets", (role, uat, includes) => {
    const steps = tourSteps(role, "Ana", uat);
    expect(steps[0]!.title).toBe("Welcome to Propfolio, Ana");
    const targets = steps.map((s) => s.target).filter(Boolean);
    for (const t of includes) expect(targets).toContain(t);
    for (const t of targets) expect(GUIDE_HINTS).toHaveProperty(t!);
  });

  it("never shows Viewers money screens", () => {
    const targets = tourSteps("VIEWER", "Ana", true).map((s) => s.target);
    expect(targets).not.toContain("nav-payments");
    expect(targets).not.toContain("nav-leases");
  });

  it("only mentions feedback in the test version", () => {
    expect(tourSteps("ADMIN", "Ana", false).map((s) => s.target)).not.toContain("feedback-button");
  });
});

describe("pageIntro", () => {
  it.each([
    ["/", "Home"],
    ["/leases", "Leases"],
    ["/leases/new", "New lease"],
    ["/leases/0195-abc/edit", "Edit lease"],
    ["/leases/0195-abc", "Lease"],
    ["/payments/new", "Record a payment"],
    ["/reports/aging", "Report"],
    ["/unknown", "This page"],
  ])("%s → %s", (path, title) => expect(pageIntro(path).title).toBe(title));
});

describe("hints", () => {
  it("are short", () => {
    for (const h of Object.values(GUIDE_HINTS)) expect(h.body.length).toBeLessThanOrEqual(200);
  });
});
