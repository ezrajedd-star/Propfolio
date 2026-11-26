import { describe, expect, it } from "vitest";

import { excerpt, searchScore, searchTerms, slugify, toBlocks } from "./articles";

describe("slugify", () => {
  it.each([
    ["How do I add a unit?", "how-do-i-add-a-unit"],
    ["Paano magdagdag ng unit (Tagalog)", "paano-magdagdag-ng-unit-tagalog"],
    ["Señor's ₱ lease!!", "senor-s-lease"],
    ["???", "article"],
  ])("%s", (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });
});

describe("toBlocks", () => {
  it("paragraphs, lists and headings; no HTML", () => {
    expect(
      toBlocks("First line\ncontinues.\n\n## Steps\n\n- Open Settings\n- Click Add\n\n<b>bold</b>"),
    ).toEqual([
      { type: "p", text: "First line continues." },
      { type: "h", text: "Steps" },
      { type: "ul", items: ["Open Settings", "Click Add"] },
      { type: "p", text: "<b>bold</b>" },
    ]);
  });
});

describe("excerpt", () => {
  it("strips markers and cuts at a word", () => {
    expect(excerpt("## Hi\n\n- one\n- two")).toBe("Hi one two");
    expect(excerpt("word ".repeat(100), 50).endsWith("…")).toBe(true);
  });
});

describe("search", () => {
  it("drops small words, ranks titles higher", () => {
    expect(searchTerms("How do I add a unit to my building?")).toEqual(["add", "unit", "building"]);
    const terms = searchTerms("add unit");
    expect(searchScore({ title: "Add a unit", body: "..." }, terms)).toBe(6);
    expect(searchScore({ title: "Leases", body: "You can add a unit later" }, terms)).toBe(2);
  });
});
