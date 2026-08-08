import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    // Playwright owns e2e/** (docs/design/E2E_SMOKE.md D5). Vitest sets no
    // `include`, so its default glob would otherwise claim any *.spec.* file
    // anywhere and execute the browser journeys under jsdom, where they
    // crash on import. The two runners must never see each other's files.
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // The whole shipped source tree, not just `src/lib`. This was
      // `["src/lib/**/*.ts"]` until 2026-08-07, which made every page,
      // component and hook under `src/app/**` invisible to the report: a UI
      // file with zero tests did not appear as a 0% row, it did not appear at
      // all, so the headline percentage rose steadily while
      // `src/app/hooks/use-coach-auth.ts` - the hook every route depends on -
      // sat untested from 2026-06-27 to 2026-08-01. The tests for `src/app/**`
      // always ran and always gated CI; only the MEASUREMENT was blind.
      //
      // Widening it is a measurement correction, so the number drops without
      // anything regressing. `src/__tests__/coverage-scope-guard.test.ts` holds
      // these patterns against the files on disk, so the scope cannot narrow
      // again, and a new source directory cannot appear outside it, without a
      // test going red.
      //
      // Test files stay out through vitest's default `coverage.exclude`
      // (`**/__tests__/**`, `**/*.test.*`), which is left untouched on purpose:
      // setting `exclude` here would REPLACE those defaults rather than add to
      // them, and the suites would start reporting coverage of themselves.
      include: ["src/**/*.ts", "src/**/*.tsx"],
    },
  },
});
