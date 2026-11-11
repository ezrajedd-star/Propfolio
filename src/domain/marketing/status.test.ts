import { describe, expect, it } from "vitest";

import { overallStatus, reminderStatus, type ServiceStatus } from "./status";

describe("reminderStatus", () => {
  const today = "2026-11-11";
  it.each([
    [null, 0, "unknown"],
    ["2026-11-11", 0, "ok"],
    ["2026-11-10", 0, "ok"],
    ["2026-11-09", 0, "degraded"],
    ["2026-11-11", 2, "degraded"],
  ] as const)("last %s, %s failed → %s", (last, failed, state) => {
    expect(reminderStatus(last, failed, today).state).toBe(state);
  });

  it("says when the last reminders went out", () => {
    expect(reminderStatus("2026-11-08", 0, today).detail).toContain("8 Nov 2026");
  });
});

describe("overallStatus", () => {
  const s = (state: ServiceStatus["state"]): ServiceStatus => ({ name: "x", state, detail: "" });
  it.each([
    [[s("ok"), s("ok")], "ok"],
    [[s("ok"), s("unknown")], "ok"],
    [[s("ok"), s("degraded")], "degraded"],
    [[s("degraded"), s("down")], "down"],
  ] as const)("%o → %s", (list, state) => {
    expect(overallStatus([...list]).state).toBe(state);
  });
});
