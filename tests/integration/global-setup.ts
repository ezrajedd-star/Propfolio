import { execSync } from "node:child_process";

import { TEST_DATABASE_URL } from "./test-db-url";

export default function setup() {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
