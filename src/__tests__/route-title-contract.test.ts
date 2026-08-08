/**
 * Drift guard between what the registry calls a route and what the BROWSER is
 * told a route is called (v0.25 D8).
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
import { metadataForRoute, ROUTE_TITLE_SUFFIX } from "@/app/route-metadata";

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

  it("derives a title for every registered route from that route's own label", () => {
    // Clause 1. Looped over ROUTES rather than written as a literal list, so a
    // fourteenth route is judged the moment it joins the registry.
    for (const route of ROUTES) {
      expect(
        metadataForRoute(route.path),
        `metadataForRoute("${route.path}") should carry the registry label "${route.label}"`,
      ).toEqual({ title: route.label });
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
