import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/display-name": "off",
      "react/no-direct-mutation-state": "off",
    },
  },
  {
    // CommonJS tool configs (`lighthouserc.cjs`) are loaded by their tool with
    // a real `require`, so `require()` is the file format, not a style choice
    // an import would improve. Scoped to `.cjs` on purpose: everything under
    // `src/` is ESM and stays covered by the rule.
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "eslint.config.mjs",
    "next.config.ts",
    "postcss.config.mjs",
  ]),
]);

export default eslintConfig;
