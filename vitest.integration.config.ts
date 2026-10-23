import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Integration tests: services against a real PostgreSQL test database. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts", "tests/integration/setup-db-env.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    // All files share one database.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
