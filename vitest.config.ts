import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Unit tests: pure logic, no database. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: { include: ["src/domain/**"], exclude: ["**/*.test.ts"], thresholds: { lines: 80 } },
  },
});
