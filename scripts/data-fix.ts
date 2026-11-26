/**
 * Run a reviewed data fix (see scripts/data-fixes/README.md).
 *
 *   pnpm data-fix scripts/data-fixes/2026-11-26-T-1042-example.ts            (dry run)
 *   pnpm data-fix scripts/data-fixes/2026-11-26-T-1042-example.ts --apply --approved-by "Name"
 *
 * On the server, use deploy/data-fix.sh: it takes a backup first.
 */
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { db } from "../src/server/db";
import { runDataFix, type DataFix } from "../src/server/data-fixes/runner";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { apply: { type: "boolean" }, "approved-by": { type: "string" } },
  });
  const file = positionals[0];
  if (!file || !/^scripts\/data-fixes\/\d{4}-\d{2}-\d{2}-[\w-]+\.ts$/.test(file)) {
    console.error(
      'Usage: pnpm data-fix scripts/data-fixes/<yyyy-mm-dd>-<ticket>-<name>.ts [--apply --approved-by "Name"]',
    );
    process.exitCode = 1;
    return;
  }
  const mod = (await import(pathToFileURL(resolve(file)).href)) as { default: DataFix };
  const fix = mod.default;
  console.log(`\n${fix.ticket}: ${fix.what}\nWhy: ${fix.why}\n`);
  const r = await runDataFix(basename(file), fix, {
    apply: Boolean(values.apply),
    approvedBy: values["approved-by"],
  });
  console.log(r.applied ? "APPLIED. Result:" : "DRY RUN (nothing was changed). It would do:");
  for (const [k, v] of Object.entries(r.summary)) console.log(`  ${k}: ${v}`);
  console.log("");
}

main()
  .catch((err: unknown) => {
    console.error(
      "The fix failed and nothing was changed:",
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
