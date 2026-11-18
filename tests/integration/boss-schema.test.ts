import { afterEach, describe, expect, it } from "vitest";

import { asSystem, db } from "@/server/db";
import { prepareBossSchema } from "@/server/jobs/boss-schema";

const SCHEMA = "pgboss_upgrade_test";
const exists = async () => {
  const [r] = await asSystem(
    () =>
      db.$queryRaw<
        { found: boolean }[]
      >`SELECT to_regclass(${`${SCHEMA}.version`}) IS NOT NULL AS found`,
  );
  return r!.found;
};
async function make(version: number) {
  await asSystem(async () => {
    await db.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
    await db.$executeRawUnsafe(`CREATE TABLE ${SCHEMA}.version (version int PRIMARY KEY)`);
    await db.$executeRawUnsafe(`INSERT INTO ${SCHEMA}.version VALUES (${version})`);
  });
}

afterEach(async () => {
  await asSystem(() => db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`));
});

describe("upgrading the job queue to pg-boss 12", () => {
  it("does nothing on a new server", async () => {
    expect(await prepareBossSchema(SCHEMA)).toBe("none");
  });
  it("keeps tables pg-boss 12 can upgrade", async () => {
    await make(25);
    expect(await prepareBossSchema(SCHEMA)).toBe("current");
    expect(await exists()).toBe(true);
  });
  it("replaces pg-boss 10's tables", async () => {
    await make(24);
    expect(await prepareBossSchema(SCHEMA)).toBe("reset");
    expect(await exists()).toBe(false);
  });
});
