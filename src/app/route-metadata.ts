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
 * SCOPE: the title only. Per-route `<meta name="description">` is thirteen
 * sentences of editorial copy and therefore a product-owner decision (D6); the
 * root description keeps applying to every route, which is imprecise but never
 * WRONG the way a title naming the wrong page is. If descriptions are ever
 * wanted, this function is where they land, additively.
 */

import type { Metadata } from "next";
import { ROUTES } from "@/lib/routes";

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
 * The `metadata` a route segment should export, derived from its registry
 * entry's `label`.
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

  return { title: entry.label };
}
