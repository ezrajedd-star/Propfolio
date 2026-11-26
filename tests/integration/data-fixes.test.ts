import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";

import { asSystem, db } from "@/server/db";
import { runDataFix, validateFix, type DataFix } from "@/server/data-fixes/runner";
import { TEST_ACCOUNT_ID, resetDb } from "./helpers";

beforeEach(resetDb);

const rename: DataFix = {
  what: "Rename the test account",
  why: "Test",
  ticket: "T-1",
  async run(tx) {
    const { count } = await tx.account.updateMany({
      where: { id: TEST_ACCOUNT_ID },
      data: { name: "Renamed" },
    });
    return { accounts: count };
  },
};

const accountName = () =>
  asSystem(() => db.account.findUniqueOrThrow({ where: { id: TEST_ACCOUNT_ID } })).then(
    (a) => a.name,
  );

describe("data-fix runner", () => {
  it("a dry run reports what would change and changes nothing", async () => {
    const r = await runDataFix("2026-11-26-T-1-rename.ts", rename, { apply: false });
    expect(r).toEqual({ applied: false, summary: { accounts: 1 } });
    expect(await accountName()).toBe("Test Leasing Co.");
    const log = await asSystem(() => db.staffLog.findFirstOrThrow());
    expect(log).toMatchObject({ action: "data_fix.dry_run", entityId: "2026-11-26-T-1-rename.ts" });
  });

  it("applying needs an approver, then changes and logs it", async () => {
    await expect(runDataFix("f.ts", rename, { apply: true })).rejects.toThrow(/approved-by/);
    const r = await runDataFix("f.ts", rename, { apply: true, approvedBy: "Ezra" });
    expect(r.applied).toBe(true);
    expect(await accountName()).toBe("Renamed");
    const log = await asSystem(() =>
      db.staffLog.findFirstOrThrow({ where: { action: "data_fix.applied" } }),
    );
    expect(log.metadata).toMatchObject({
      ticket: "T-1",
      approvedBy: "Ezra",
      summary: { accounts: 1 },
    });
  });

  it("a failing fix changes nothing", async () => {
    const broken: DataFix = {
      ...rename,
      async run(tx) {
        await rename.run(tx);
        throw new Error("boom");
      },
    };
    await expect(runDataFix("f.ts", broken, { apply: true, approvedBy: "Ezra" })).rejects.toThrow(
      "boom",
    );
    expect(await accountName()).toBe("Test Leasing Co.");
  });

  it("refuses a fix without what, why or ticket", async () => {
    expect(validateFix({ run: rename.run })).toHaveLength(3);
    await expect(runDataFix("f.ts", { ...rename, ticket: "" }, { apply: false })).rejects.toThrow(
      /ticket/,
    );
  });
});

describe("every fix in scripts/data-fixes runs as a dry run", () => {
  const dir = join(process.cwd(), "scripts/data-fixes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  it.each(files)("%s", async (file) => {
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as { default: DataFix };
    expect(validateFix(mod.default)).toEqual([]);
    const r = await runDataFix(file, mod.default, { apply: false });
    expect(r.applied).toBe(false);
  });
});
