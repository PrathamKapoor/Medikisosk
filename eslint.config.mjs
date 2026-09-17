import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Manifest-only workspaces are deliberately outside this implemented-code scope.
const sources = [
  "packages/{shared-types,clinical-schema,safety-rules,auth,i18n}/src/**/*.ts",
  "services/api/src/**/*.ts",
  "apps/kiosk/**/*.{ts,tsx}",
  "vitest.config.ts",
];

export default [
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  {
    files: sources,
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...js.configs.recommended.rules,
      // TypeScript checks declarations and identifiers; core rules misread types.
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "@typescript-eslint/no-duplicate-enum-values": "error",
      "@typescript-eslint/no-misused-new": "error",
      "@typescript-eslint/no-unsafe-declaration-merging": "error",
    },
  },
];
