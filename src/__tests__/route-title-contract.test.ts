/**
 * Drift guard between what the registry calls a route and what the BROWSER is
 * told a route is called (v0.25 D8) — and, since v0.27, what the WORLD is told
 * a route is: the per-route `<meta name="description">` and the Open Graph
 * block ride the same registry-vs-built-export comparison (D7 of
 * `docs/design/ROUTE_PREVIEWS.md`: no new suite, this file's subject is
 * already "the registry vs. the built static export").
 *
 * Source A: `src/lib/routes.ts` - the one registry, via
 *   `src/app/route-metadata.ts`'s `metadataForRoute()`, which is CALLED here
 *   rather than grepped.
 * Source B: the built static export on disk - `out/<route>/index.html`, the
 *   exact bytes GitHub Pages serves.
 * Source C: `docs/RENAME_RUNBOOK.md` - which quotes `/`'s `<title>` verbatim
 *   as the evidence that the 2026-07-29 repo rename completed.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Until v0.25 all thirteen routes served ONE identical `<title>`, and it was
 * structural: every `page.tsx` here is `"use client"` and a client component
 * may not export `metadata`, so the root title was the only one that existed.
 * The expensive half was not the tab name. Next's route announcer
 * (`next/dist/client/components/app-router-announcer.js`, effect body lines
 * 50-67) announces a destination only `if (previousTitle.current !==
 * currentTitle)` and reads `document.title` in PREFERENCE to the page `<h1>`,
 * so a constant title meant the announcer was never called AND the `<h1>`
 * fallback that would have rescued it was unreachable. Three milestones made
 * twelve doors reachable; nothing named the room behind them.
 * `docs/design/ROUTE_IDENTITY.md` sections 1a-1d carry the measurements.
 *
 * WHY IT READS THE BUILD AND NOT THE SOURCE (D8)
 * ----------------------------------------------
 * A source-level assertion passes on a `metadata` export that Next never
 * applied - wrong file, wrong segment, a client boundary in the way, a
 * template that does not compose. Only the emitted HTML can tell you the tab
 * actually says `Slicer`. That is also why the missing-`out/` case FAILS with
 * an instruction to build rather than skipping: a skipped gate reports green
 * about something it never read. CI's quality gate runs `npm run build`
 * before `npm run test:coverage`, so `out/` always exists there; the pattern
 * is the one `src/__tests__/serve-compression.test.ts:70-76` established.
 *
 * WHAT THE CONTROL FOR THIS FILE MUST PERTURB, AND WHAT IT MUST NOT
 * ----------------------------------------------------------------
 * The consumer, never the registry (D3 of the done-when list). Editing a
 * `label` in `src/lib/routes.ts` moves the expectation and the rendered title
 * TOGETHER, because both derive from it - so that control comes back green,
 * and a green control is the failure signal rather than the pass. The controls
 * that mean something are: delete `export const metadata` from one segment
 * layout and rebuild (the route's title falls back to the root default, which
 * fails both the equality clause and the distinctness clause), and make
 * `metadataForRoute` return `{}` and rebuild (which a source-scanning guard
 * would sail straight through).
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROUTES } from "@/lib/routes";
import { metadataForRoute, ROOT_TITLE, ROUTE_TITLE_SUFFIX } from "@/app/route-metadata";
import { SITE_URL } from "../../site-base-path.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "out");
const RUNBOOK_PATH = path.join(ROOT, "docs/RENAME_RUNBOOK.md");

/**
 * Read with line endings normalised. This repo is checked out CRLF on Windows
 * and LF on the Linux runner, so every regex over a COMMITTED file must see
 * the same text. The built HTML is written by the build that just ran and is
 * therefore already LF, but normalising it too costs nothing and keeps one
 * reader for both kinds of input.
 */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/** `/` -> `out/index.html`, `/slicer` -> `out/slicer/index.html`. Pure. */
function exportedHtmlPath(routePath: string): string {
  const segments = routePath.split("/").filter((segment) => segment.length > 0);
  return path.join(OUT_DIR, ...segments, "index.html");
}

/**
 * Undo React's attribute escaping, so a description drafted with quotes or an
 * apostrophe (`"just do it"`, `today's`) compares equal to the registry string
 * it was rendered from. `&amp;` last, or an escaped escape would double-decode.
 */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Every `content` value of `<meta name="…">` / `<meta property="…">` tags in a
 * route's built HTML, decoded. Returns ALL matches rather than the first so a
 * caller can assert "exactly one": two descriptions in one document is a real
 * defect (crawlers pick whichever they like), and "take the first" would hide
 * it. Tolerant of attribute order within the tag, because the emitter's
 * ordering is Next's choice, not this contract's.
 */
function exportedMetaContents(
  routePath: string,
  attribute: "name" | "property",
  value: string,
): string[] {
  const htmlPath = exportedHtmlPath(routePath);

  expect(
    existsSync(htmlPath),
    `${path.relative(ROOT, htmlPath)} is missing - run \`npm run build\` first. ` +
      "This suite asserts the real static export, so it cannot substitute a " +
      "fixture and must never skip.",
  ).toBe(true);

  const tags = readText(htmlPath).match(/<meta\b[^>]*>/g) ?? [];

  return tags
    .filter((tag) => new RegExp(`\\b${attribute}="${value}"`).test(tag))
    .map((tag) => {
      const content = /\bcontent="([^"]*)"/.exec(tag);
      expect(
        content,
        `${routePath}: a <meta ${attribute}="${value}"> tag carries no content attribute`,
      ).not.toBeNull();
      return decodeHtmlEntities(content![1]);
    });
}

/**
 * The one description a route serves. Exactly one, for the same reason
 * `exportedTitle` insists on exactly one `<title>`.
 */
function exportedDescription(routePath: string): string {
  const contents = exportedMetaContents(routePath, "name", "description");

  expect(
    contents.length,
    `${routePath} serves ${contents.length} <meta name="description"> tags, expected exactly 1`,
  ).toBe(1);

  return contents[0];
}

/** The one value a route serves for an Open Graph property. Exactly one. */
function exportedOgContent(routePath: string, property: string): string {
  const contents = exportedMetaContents(routePath, "property", property);

  expect(
    contents.length,
    `${routePath} serves ${contents.length} <meta property="${property}"> tags, expected exactly 1`,
  ).toBe(1);

  return contents[0];
}

/**
 * The canonical deployed URL of a route in the trailing-slash form the export
 * serves, composed HERE from `SITE_URL` and the path — deliberately not by
 * calling `canonicalUrlForRoute()`, which is the derivation under test
 * (L-054): an expectation that consumed the derivation would move with it,
 * and control C (the basePath dropped) could never fail.
 */
function expectedCanonicalUrl(routePath: string): string {
  return routePath === "/" ? SITE_URL : `${SITE_URL}${routePath.slice(1)}/`;
}

/**
 * The sentence `/` served before v0.27, byte-for-byte, as a LITERAL: the same
 * independence argument `runbookRootTitle()` makes for the title. Reading the
 * expectation out of the registry would let an edit to the root entry's
 * `description` move the expectation and the artifact together, and D3's
 * byte-identity clause could never fail.
 */
const ROOT_DESCRIPTION =
  "Your ADHD friendly self-improvement coach. Small, deliberate daily steps that fit how your brain works.";

/**
 * The `<title>` the export actually serves for a route.
 *
 * Asserts there is exactly ONE title element rather than taking the first
 * match: two titles in one document is a real defect (browsers keep the first
 * and the announcer reads whatever `document.title` resolved to), and "take
 * the first" would hide it.
 */
function exportedTitle(routePath: string): string {
  const htmlPath = exportedHtmlPath(routePath);

  expect(
    existsSync(htmlPath),
    `${path.relative(ROOT, htmlPath)} is missing - run \`npm run build\` first. ` +
      "This suite asserts the real static export, so it cannot substitute a " +
      "fixture and must never skip.",
  ).toBe(true);

  const matches = [...readText(htmlPath).matchAll(/<title>([^<]*)<\/title>/g)];

  expect(
    matches.length,
    `${path.relative(ROOT, htmlPath)} contains ${matches.length} <title> elements, expected exactly 1`,
  ).toBe(1);

  return matches[0][1];
}

/**
 * The `/` title as `docs/RENAME_RUNBOOK.md` records it.
 *
 * Deliberately NOT read from `src/app/layout.tsx`: a guard that reads the
 * value out of the module it is judging compares a value against its own
 * source and cannot fail. The runbook is an independent, dated record - it
 * quotes the string as the evidence that the 2026-07-29 rename completed - so
 * holding the built export to it keeps that record true instead of letting it
 * decay into a sentence that reads as current and is not.
 */
function runbookRootTitle(): string {
  const flat = readText(RUNBOOK_PATH).replace(/\s+/g, " ");
  const match = /`<title>` = "([^"]+)"/.exec(flat);

  if (match === null) {
    throw new Error(
      "docs/RENAME_RUNBOOK.md no longer quotes the deployed `<title>` the way this " +
        "guard reads it. If the runbook was rewritten, update this parser in the same " +
        "commit; do not delete the assertion - that quote is why `/` keeps its string.",
    );
  }

  return match[1];
}

const ROOT_ROUTE = "/";
const nonRootRoutes = ROUTES.filter((route) => route.path !== ROOT_ROUTE);

describe("route titles: the registry vs. the built static export", () => {
  it("judges a real registry and a real export (zero-match hard failure)", () => {
    // Without this every loop below is vacuously green on an empty registry or
    // an `out/` that was never produced.
    expect(ROUTES.length, "src/lib/routes.ts exported no routes; the corpus is empty, not clean").toBe(13);
    expect(nonRootRoutes.length, "every route is the root route; the split below is vacuous").toBe(12);
    expect(
      existsSync(path.join(OUT_DIR, "index.html")),
      "out/index.html is missing - run `npm run build` first; this suite reads the export",
    ).toBe(true);
  });

  it("derives every route's metadata from that route's own registry entry", () => {
    // Clause 1, widened by v0.27 D2. Looped over ROUTES rather than written as
    // a literal list, so a fourteenth route is judged the moment it joins the
    // registry. `title` stays the bare label (the root template renders it);
    // `openGraph.title` is the SERVED form, `/`'s untemplated per D3. The
    // expectation is composed from the entry's own fields plus literals.
    for (const route of ROUTES) {
      expect(
        metadataForRoute(route.path),
        `metadataForRoute("${route.path}") should derive from the registry entry for "${route.label}"`,
      ).toEqual({
        title: route.label,
        description: route.description,
        openGraph: {
          title: route.path === "/" ? ROOT_TITLE : `${route.label}${ROUTE_TITLE_SUFFIX}`,
          description: route.description,
          url: expectedCanonicalUrl(route.path),
          type: "website",
          siteName: "ADHD Daily Coach",
        },
      });
    }
  });

  it("throws for a path the registry does not know", () => {
    // A silent fallback would hide an unregistered route behind a
    // plausible-looking tab name. `/slicer/` (trailing slash) is included on
    // purpose: it is the form the export SERVES, and it is the likeliest way a
    // caller gets the lookup wrong.
    expect(() => metadataForRoute("/not-a-route")).toThrow(/no entry in src\/lib\/routes\.ts/);
    expect(() => metadataForRoute("/slicer/")).toThrow(/no entry in src\/lib\/routes\.ts/);
  });

  it("serves a distinct <title> on every one of the thirteen routes", () => {
    // Clause 2a, the assertion the whole milestone exists for, written as a
    // set-size comparison so it fails the moment ANY two routes collide -
    // which is the state the app shipped in until v0.25, when all thirteen
    // were the same string.
    const titles = ROUTES.map((route) => exportedTitle(route.path));
    const distinct = new Set(titles);

    expect(
      distinct.size,
      `${titles.length} routes serve only ${distinct.size} distinct titles: ` +
        `${[...distinct].join(" | ")}`,
    ).toBe(titles.length);
  });

  it("names the room in the tab: <label> · ADHD Daily Coach on every non-root route", () => {
    // Clause 2b. The expectation is composed from the registry's label and the
    // suffix the root template declares; the observation is the built HTML.
    for (const route of nonRootRoutes) {
      expect(
        exportedTitle(route.path),
        `${route.path} does not carry its own name in the built export`,
      ).toBe(`${route.label}${ROUTE_TITLE_SUFFIX}`);
    }
  });

  it("leaves the front door's title byte-identical to the string the rename runbook records", () => {
    // Clause 2c. `/` is excluded from the template (D3): its title is the
    // site's title, it is what search results and link previews show, and
    // docs/RENAME_RUNBOOK.md quotes it as dated rename evidence.
    expect(exportedTitle(ROOT_ROUTE)).toBe(runbookRootTitle());
    expect(exportedTitle(ROOT_ROUTE)).not.toContain(ROUTE_TITLE_SUFFIX);
  });
});

describe("route descriptions: the registry vs. the built static export (v0.27)", () => {
  it("serves a distinct description on every one of the thirteen routes", () => {
    // v0.27 done-when clause 1, written as a set-size comparison for the same
    // reason the title clause is: it fails the moment ANY two routes collide,
    // and thirteen-identical — the state the app shipped in until v0.27 — is
    // the loudest possible red. `exportedDescription` already asserts each
    // route serves EXACTLY one description tag.
    const descriptions = ROUTES.map((route) => exportedDescription(route.path));
    const distinct = new Set(descriptions);

    expect(
      distinct.size,
      `${descriptions.length} routes serve only ${distinct.size} distinct descriptions: ` +
        `${[...distinct].join(" | ")}`,
    ).toBe(descriptions.length);
  });

  it("serves each non-root route's own registry sentence", () => {
    // v0.27 done-when clause 2. The expectation is the registry entry's
    // `description` — never `metadataForRoute()`, the derivation under test
    // (L-054). Control B (one segment layout's metadata deleted) reds exactly
    // one iteration of this loop, naming the route that fell back to the root
    // sentence.
    for (const route of nonRootRoutes) {
      expect(
        exportedDescription(route.path),
        `${route.path} does not serve its own registry description in the built export`,
      ).toBe(route.description);
    }
  });

  it("leaves the front door's description byte-identical to the pre-v0.27 sentence", () => {
    // v0.27 done-when clause 2's root half (D3): the sentence is the site's
    // description in search results, and this milestone has no evidence it
    // should change. Asserted against a literal, not the registry, so moving
    // the root entry's sentence is a red here rather than a silent rewrite.
    expect(exportedDescription(ROOT_ROUTE)).toBe(ROOT_DESCRIPTION);
  });
});

describe("open graph: the built export carries the block, base path included (v0.27 D4)", () => {
  it("has a base path to lose at all (vacuity check for the og:url clause)", () => {
    // The og:url clause below proves the project-page base path survived URL
    // composition. If `SITE_URL` ever degenerated to a bare origin, that
    // clause would pass while proving nothing — so the precondition is
    // asserted, not assumed.
    expect(
      new URL(SITE_URL).pathname,
      "SITE_URL carries no path segment, so 'the og:url keeps the base path' is vacuous",
    ).not.toBe("/");
    expect(SITE_URL.endsWith("/"), "SITE_URL must end in a slash for composition").toBe(true);
  });

  it("carries og:title equal to the served <title> on every route", () => {
    // v0.27 done-when clause 3. Both halves are read from the same built
    // artifact: the root `title.template` reaches `<title>` but not the Open
    // Graph block, so equality here is exactly the drift this guards.
    for (const route of ROUTES) {
      expect(
        exportedOgContent(route.path, "og:title"),
        `${route.path}'s og:title does not match the <title> the same page serves`,
      ).toBe(exportedTitle(route.path));
    }
  });

  it("carries og:description equal to the served description on every route", () => {
    // One voice, not two (D4): the preview a platform unfurls and the snippet
    // a search engine shows must be the same sentence.
    for (const route of ROUTES) {
      expect(
        exportedOgContent(route.path, "og:description"),
        `${route.path}'s og:description does not match the description the same page serves`,
      ).toBe(exportedDescription(route.path));
    }
  });

  it("carries og:url in the canonical deployed trailing-slash form, base path intact", () => {
    // v0.27 done-when clause 3's sharp edge: `new URL("/now/", base)` resolves
    // against the ORIGIN and silently drops `/adhd-daily-coach/`. The
    // expectation is composed here from SITE_URL plus the path (L-054), so a
    // dropped base path — control C — is a red naming the origin-resolved URL,
    // and "an og:url exists" cannot satisfy this clause (L-033).
    for (const route of ROUTES) {
      expect(
        exportedOgContent(route.path, "og:url"),
        `${route.path}'s og:url is not its canonical deployed URL - if it lost the ` +
          "base path, the basePath trap fired",
      ).toBe(expectedCanonicalUrl(route.path));
    }
  });

  it("carries og:type website and the site name on every route", () => {
    for (const route of ROUTES) {
      expect(exportedOgContent(route.path, "og:type"), `${route.path} og:type`).toBe("website");
      expect(
        exportedOgContent(route.path, "og:site_name"),
        `${route.path} og:site_name`,
      ).toBe("ADHD Daily Coach");
    }
  });
});
