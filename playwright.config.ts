import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke harness (v0.16, docs/design/E2E_SMOKE.md).
 *
 * The suite walks the REAL static export the way GitHub Pages serves it:
 * `out/` from a production `npm run build`, mounted under the production
 * `/calm-daily-coach` basePath with trailing slashes (design decision D3).
 * It never runs against `next dev`, because the prerender/hydrate boundary of
 * the exported artifact is half the reason the suite exists.
 *
 * Chromium only (D2), specs live in `e2e/` only (D5 - vitest excludes this
 * directory so the two runners never see each other's files).
 */

/** One place for the served shape; e2e/serve.mjs reads the same values. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const E2E_BASE_PATH = "/calm-daily-coach";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // `test.only` left in a spec must fail CI, not silently shrink the suite.
  forbidOnly: !!process.env.CI,
  // Playwright's recommended CI retries are acceptable per the design doc,
  // with the recorded caveat: a test that passes only on retry is a bug to
  // fix, not a state to accept. Retries are visible in the report.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node e2e/serve.mjs",
    url: `http://127.0.0.1:${E2E_PORT}${E2E_BASE_PATH}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
