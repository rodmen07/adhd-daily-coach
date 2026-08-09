/**
 * What the BROWSER calls a route, derived from the one registry that already
 * names it (v0.25 D2, D4).
 *
 * Until v0.25 all thirteen routes served one identical `<title>`, and it was
 * structural rather than an oversight: every `page.tsx` in this app is
 * `"use client"`, and in the App Router a client component may not export
 * `metadata`, so the only shape available was the root one. The cost was not
 * cosmetic. Next's route announcer
 * (`next/dist/client/components/app-router-announcer.js`) speaks the
 * destination after a client-side navigation only `if (previousTitle.current
 * !== currentTitle)`, and reads `document.title` in PREFERENCE to the page
 * `<h1>` - so one constant title meant the condition was never true, the
 * announcer stayed empty on every navigation, and the `<h1>` fallback that
 * would have rescued it was unreachable precisely BECAUSE a title was always
 * set. See `docs/design/ROUTE_IDENTITY.md` section 1c.
 *
 * WHY THIS IS ONE MODULE RATHER THAN TWELVE INLINE LITERALS
 * --------------------------------------------------------
 * A guard can CALL `metadataForRoute("/slicer")` and assert the object it
 * returns. A guard over twelve inline `export const metadata = { title: "..." }`
 * literals could only grep twelve files, and text that MENTIONS a title is
 * indistinguishable from a title - the same failure that made a `<h1>` source
 * grep lie while defining this milestone (section 1b of the same document).
 *
 * WHY IT THROWS
 * -------------
 * An unregistered path is a route the registry does not know about, which is
 * already a red in `route-registry-guard.test.ts`. Returning a silent fallback
 * title here would hide it behind a plausible-looking tab name instead, so the
 * caller gets a build-time failure naming the path.
 *
 * SCOPE, widened by v0.27 (D2): the title, the description, and the Open Graph
 * block. Until v0.27 this returned `{ title }` only and the root description
 * applied to every route — imprecise but never WRONG the way a title naming
 * the wrong page is. The thirteen description sentences were editorial copy
 * and therefore a product-owner decision; `docs/design/ROUTE_PREVIEWS.md` D6
 * drafted them as overridable defaults and they now live on each registry
 * entry, so this function derives everything and the twelve segment layouts
 * picked the widening up with zero edits.
 *
 * THE BASEPATH TRAP (D4)
 * ----------------------
 * The deployed site lives under a project-page basePath
 * (`https://rodmen07.github.io/adhd-daily-coach/`), and `new URL("/now/",
 * base)` resolves against the ORIGIN — it silently drops `/adhd-daily-coach/`.
 * So `og:url` is composed by string concatenation onto `SITE_URL` (which ends
 * in a slash) and never by URL-resolving an absolute path against a base.
 * `src/__tests__/route-title-contract.test.ts` asserts the BUILT artifact's
 * `og:url` carries the base path, so a regression here is a red, not a
 * surprise.
 */

import type { Metadata } from "next";
import { ROUTES } from "@/lib/routes";
import { SITE_URL } from "../../site-base-path.mjs";

/**
 * The suffix the root layout's `title.template` appends, written here only so
 * the doc comment can name the shape callers get. The template itself lives in
 * `src/app/layout.tsx` and is applied by Next, not by this module: a segment
 * exporting `title: "Slicer"` is rendered as `Slicer · ADHD Daily Coach`.
 *
 * `/` is deliberately NOT templated (D3). It exports no title of its own and
 * keeps the root `default` byte-for-byte, because that string is the site's
 * title in search results and link previews, and because
 * `docs/RENAME_RUNBOOK.md` records it verbatim as the evidence that the
 * 2026-07-29 rename completed.
 */
export const ROUTE_TITLE_SUFFIX = " · ADHD Daily Coach";

/**
 * The `<title>` the ROOT route serves, byte-for-byte (v0.25 D3, v0.27 D3).
 *
 * `/` is deliberately NOT templated: this string is the site's title in search
 * results and link previews, and `docs/RENAME_RUNBOOK.md` quotes it verbatim
 * as the evidence that the 2026-07-29 rename completed. It lives here so the
 * root layout's `title.default` and the root `og:title` (which clause 3 of the
 * v0.27 done-when holds equal to the SERVED title) are one string rather than
 * two agreeing ones. `src/__tests__/route-title-contract.test.ts` holds the
 * built `out/index.html` to the runbook's independent record of it.
 */
export const ROOT_TITLE = "ADHD Daily Coach: Your friendly self-improvement coach";

/** What every route's Open Graph block says the site is called (v0.27 D4). */
export const OG_SITE_NAME = "ADHD Daily Coach";

/**
 * The canonical deployed URL of a route, in the trailing-slash form the static
 * export serves. Composed by concatenation (see THE BASEPATH TRAP above):
 * `SITE_URL` already ends in `/`, so `/` maps to `SITE_URL` itself and
 * `/now` maps to `${SITE_URL}now/`.
 */
export function canonicalUrlForRoute(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path.slice(1)}/`;
}

/**
 * The `metadata` a route segment should export, derived from its registry
 * entry's `label` and `description`.
 *
 * The `title` field carries the BARE label because Next applies the root
 * layout's `title.template` to it; `openGraph.title` carries the SERVED form
 * (label plus suffix) because the template does not reach into `openGraph`,
 * and clause 3 of the v0.27 done-when holds `og:title` equal to the served
 * `<title>`. `/` is the one route whose served title is not templated (D3),
 * so its `og:title` is `ROOT_TITLE` — the root layout consumes this
 * function's `description` and `openGraph` while keeping its own
 * template-shaped `title`, exactly as `src/app/layout.tsx` documents.
 *
 * @param path a registry path written WITHOUT a trailing slash, the form every
 *   href in this app and every `ROUTES` entry uses.
 * @throws if `path` is not in `ROUTES`.
 */
export function metadataForRoute(path: string): Metadata {
  const entry = ROUTES.find((route) => route.path === path);

  if (entry === undefined) {
    throw new Error(
      `metadataForRoute("${path}"): no entry in src/lib/routes.ts has that path. ` +
        "Add the route to the registry (which route-registry-guard.test.ts already " +
        "requires) rather than giving this segment a hand-written title.",
    );
  }

  return {
    title: entry.label,
    description: entry.description,
    openGraph: {
      title: path === "/" ? ROOT_TITLE : `${entry.label}${ROUTE_TITLE_SUFFIX}`,
      description: entry.description,
      url: canonicalUrlForRoute(path),
      type: "website",
      siteName: OG_SITE_NAME,
    },
  };
}
