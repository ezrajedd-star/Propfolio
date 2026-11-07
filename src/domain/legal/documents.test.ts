import { describe, expect, it } from "vitest";

import { LEGAL_INFO, currentVersions, documentsToAccept, type Acceptance } from "./documents";

describe("documentsToAccept", () => {
  const current = currentVersions();
  it.each<[string, Acceptance[], string[]]>([
    ["nothing accepted yet", [], ["TERMS", "PRIVACY", "DPA"]],
    ["everything current", current, []],
    [
      "an older Terms version",
      [{ document: "TERMS", version: "2020-01-01" }, ...current.slice(1)],
      ["TERMS"],
    ],
    ["only the DPA", [{ document: "DPA", version: LEGAL_INFO.DPA.version }], ["TERMS", "PRIVACY"]],
  ])("%s", (_name, accepted, expected) => {
    expect(documentsToAccept(accepted)).toEqual(expected);
  });
});
