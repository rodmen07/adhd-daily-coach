import type { NextConfig } from "next";

import { SITE_BASE_PATH, SITE_URL } from "./site-base-path.mjs";

const isProduction = process.env.NODE_ENV === "production";

/**
 * The GitHub Pages project-page basePath is the REPO NAME, so it is derived
 * rather than hardcoded. The derivation - and the reason it is shared with
 * `playwright.config.ts` and `e2e/serve.mjs` instead of copied into each -
 * lives in `site-base-path.mjs`.
 *
 * WHAT THAT DERIVATION DOES NOT DO - read docs/RENAME_RUNBOOK.md before
 * renaming the repo. It makes the NEXT BUILD correct under whatever the repo
 * is called at that moment; it does not rebuild the artifact already deployed.
 * A repo rename fires no workflow event, and
 * `.github/workflows/deploy-pages.yml` triggers only on `push` to `main` and
 * `workflow_dispatch`, so at the moment of the rename GitHub Pages keeps
 * serving the SAME un-rebuilt artifact at the new URL with every asset still
 * prefixed by the old slug. The live site is broken - unstyled, unhydrated, on
 * all 13 routes - until a rebuild is triggered by hand. Renaming is therefore
 * a two-step operation to be done back to back: rename, then immediately run
 * `Deploy to GitHub Pages` via workflow_dispatch.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: isProduction ? SITE_BASE_PATH : "",
  assetPrefix: isProduction ? `${SITE_BASE_PATH}/` : undefined,
  env: {
    /**
     * The deployed site's own URL, derived from the same repo name as the
     * basePath and inlined into the client bundle at build time.
     *
     * `src/lib/reminder-ics.ts` embeds it in every downloaded .ics file, which
     * is a PERSISTED USER ARTIFACT: once imported into Google/Apple/Outlook it
     * keeps whatever URL it was built with, and the .ics UID is frozen, so a
     * wrong value is not repaired on re-import for events that already exist.
     * A hand-maintained literal there would be wrong on one side of the rename
     * no matter which way it was set, so it is derived here instead and there
     * is nothing to flip.
     */
    NEXT_PUBLIC_APP_URL: SITE_URL,
  },
};

export default nextConfig;
