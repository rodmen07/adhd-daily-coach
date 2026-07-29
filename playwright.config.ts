import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke harness (v0.16, docs/design/E2E_SMOKE.md).
 *
 * The suite walks the REAL static export the way GitHub Pages serves it:
 * `out/` from a production `npm run build`, mounted under the production
 * repo-name basePath with trailing slashes (design decision D3).
 * It never runs against `next dev`, because the prerender/hydrate boundary of
 * the exported artifact is half the reason the suite exists.
 *
 * Chromium only (D2), specs live in `e2e/` only (D5 - vitest excludes this
 * directory so the two runners never see each other's files).
 */

/**
 * One place for the served shape; e2e/serve.mjs receives the same values
 * through `webServer.env` below, so the export and the server can never
 * disagree about the basePath.
 *
 * The basePath is derived exactly the way `next.config.ts` derives it (repo
 * name from `GITHUB_REPOSITORY`, new-slug fallback). If this pinned a literal
 * instead, the pending `calm-daily-coach` -> `adhd-daily-coach` repo rename
 * would build the export at one prefix and mount the server at another, and
 * serve.mjs would 404 every request by design.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const E2E_BASE_PATH = `/${
  process.env.SITE_REPO_NAME ??
  process.env.GITHUB_REPOSITORY?.split("/")[1] ??
  "adhd-daily-coach"
}`;

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
    // Hand the server the resolved basePath so it never keeps its own copy.
    env: { E2E_BASE_PATH },
    url: `http://127.0.0.1:${E2E_PORT}${E2E_BASE_PATH}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
