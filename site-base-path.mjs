/**
 * SINGLE SOURCE OF TRUTH for the GitHub Pages project-page slug.
 *
 * A GitHub Pages project site is served from `https://<user>.github.io/<repo>/`,
 * so the repo name is not cosmetic: it is the `basePath` every asset, chunk and
 * route in the static export is prefixed with. It is derived here rather than
 * hardcoded because the repo is being renamed from `calm-daily-coach` to
 * `adhd-daily-coach`, and a literal would 404 the entire site on one side of
 * that rename whichever way it was written. `GITHUB_REPOSITORY` is injected
 * automatically into every GitHub Actions job, so whichever build runs next is
 * correct under whatever the repo is called at that moment.
 *
 * WHY THIS IS ITS OWN MODULE: three separate places need the same answer, and
 * they must agree exactly or nothing works.
 *
 *   - `next.config.ts`      builds the export at this prefix
 *   - `playwright.config.ts` navigates the e2e suite to this prefix
 *   - `e2e/serve.mjs`        mounts `out/` at this prefix
 *
 * When each kept its own copy of the derivation, editing one alone silently
 * mounted the server at one prefix and the export at another, and every single
 * request 404d - a failure mode that looks like a broken app, not a config
 * typo. Import from here instead of re-deriving.
 *
 * Deliberately plain ESM with zero dependencies and no TypeScript, because
 * `e2e/serve.mjs` is run directly by Node with no compile step, while the two
 * `.ts` configs are compiled by Next and Playwright respectively. `.mjs` is the
 * one format all three consume unchanged.
 *
 * WHAT THIS DERIVATION DOES NOT DO - read docs/RENAME_RUNBOOK.md before
 * renaming. It fixes the NEXT build; it does not rebuild the artifact already
 * deployed. A repo rename fires no workflow event, so the rename needs a
 * manually triggered rebuild and has a real outage window.
 */

/** First value that is present and not blank, so `SITE_REPO_NAME=""` cannot
 *  collapse the basePath to "/" and 404 the whole site. */
function firstNonBlank(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "");
}

/**
 * `SITE_REPO_NAME` is a manual override for preview builds and forks that want
 * to pin a basePath without editing tracked files. The final fallback is only
 * reached OUTSIDE Actions (`GITHUB_REPOSITORY` is never unset there), so it
 * affects local builds and the local e2e run only, never a deployed artifact.
 * It is pinned to the post-rename slug.
 */
export const SITE_REPO_NAME =
  firstNonBlank(
    process.env.SITE_REPO_NAME,
    process.env.GITHUB_REPOSITORY?.split("/")[1],
  ) ?? "adhd-daily-coach";

/** Leading slash, no trailing slash: exactly what Next's `basePath` wants. */
export const SITE_BASE_PATH = `/${SITE_REPO_NAME}`;

/** Absolute public URL of the deployed site, with a trailing slash. */
export const SITE_URL = `https://rodmen07.github.io/${SITE_REPO_NAME}/`;
