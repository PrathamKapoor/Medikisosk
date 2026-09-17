/**
 * Root Vitest configuration for MediKiosk.
 *
 * Why root-level: a single config covers every workspace (packages, services,
 * apps, integration tests) so `npm test` runs the whole suite without each
 * package maintaining its own copy. The test files live next to the source they
 * test, and are excluded from each package's `tsc` build via tsconfig `exclude`.
 *
 * Workspace packages are CommonJS and are resolved through their compiled `dist/`
 * (see `package.json` "main"/"types"). Tests that exercise a package's own
 * internals use relative imports so they compile the source on the fly; tests
 * that cross package boundaries resolve via `dist/`, which must therefore be
 * built first (`npm run build`). A `pretest` script enforces that ordering.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "services/**/*.test.ts",
      "apps/**/*.test.{ts,tsx}",
      "tests/**/*.test.ts",
      "integration/**/*.test.ts",
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: [
        "packages/safety-rules/src/assess.ts",
        "services/api/src/auth/**/*.ts",
      ],
      exclude: ["**/__tests__/**", "**/dist/**", "**/*.test.ts"],
    },
  },
});
