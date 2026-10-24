import { describe, expect, it } from "vitest";

import { auditActionLabel, failureReasonLabel } from "./labels";

describe("audit labels", () => {
  it("names actions in plain words and falls back to the raw name", () => {
    expect(auditActionLabel("lease.terminate")).toBe("Ended lease early");
    expect(auditActionLabel("something.new")).toBe("something.new");
  });
  it("explains failure reasons", () => {
    expect(failureReasonLabel("wrong_password")).toBe("wrong password");
    expect(failureReasonLabel(42)).toBeNull();
  });
});
