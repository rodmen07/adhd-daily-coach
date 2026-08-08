/**
 * Every route in the front door must have a second door.
 *
 * Source A: `src/lib/routes.ts` - every entry marked `inPrimaryNav: true`.
 * Source B: the shipped `src/app` tree, glob-discovered (never hand-listed),
 *   with the two surfaces that ARE the navigation excluded by name:
 *   `site-nav.tsx` and `keyboard-help.tsx`. What is left is the product's own
 *   contextual links - the dashboard rail, the loop's next/previous buttons,
 *   the paywall's Pricing link, the pages that link home.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * v0.23 began as "the header is 264 px tall on a phone and wraps to four rows,
 * collapse it". A census run before anything was written falsified that plan
 * (`docs/design/NAV_SHAPE.md` section 1c, measured at `776ab2b`): six of the
 * twelve primary-nav routes were linked from NOWHERE else in the product -
 * `/slicer`, `/ambient`, `/breathe`, `/challenges`, `/trends` and `/journal` -
 * and four of those six carried no `g` chord either, so a header pill was their
 * ONLY affordance in the entire app. Collapsing the header first would have
 * taken four routes' only door and hidden it one interaction deeper while
 * calling it a usability improvement.
 *
 * `route-registry-guard.test.ts` could not have caught that. It holds the
 * registry, the rendered nav and the chord table to each other, so a route that
 * is in the nav and only in the nav is perfectly consistent by its lights. The
 * question "is the nav the ONLY way in" needs a different source - the rest of
 * the app - which is what this file reads.
 *
 * WHAT IS DELIBERATELY NOT COUNTED, AND WHY
 * -----------------------------------------
 * 1. `site-nav.tsx` and `keyboard-help.tsx`. Counting them would make every
 *    route trivially reachable and the census would assert nothing. Both are
 *    asserted to still exist below, so renaming one does not silently turn its
 *    exclusion into a no-op that re-admits the nav to its own census.
 * 2. Comments. `withoutComments` runs first, so a module doc may name `/slicer`
 *    (this one does, repeatedly) without conjuring a door out of prose. That is
 *    the difference between a census and an existence grep.
 * 3. Derived hrefs. `<Link href={route.path}>` is not a literal and is not
 *    counted, on purpose: a link generated FROM the registry is the nav by
 *    another name, and counting it would let the header's own derivation
 *    satisfy the census.
 * 4. `inPrimaryNav: false` routes. `/monetization` has exactly one door, inside
 *    the dashboard's collapsed insights disclosure, and that is the intent
 *    v0.22 settled (`docs/design/ROUTE_VOCABULARY.md` D3).
 *
 * WHY BOTH HREF FORMS
 * -------------------
 * The dashboard stores its rail targets as object fields (`href: "/focus"`,
 * `page.tsx`), while pages write JSX attributes (`href="/pricing"`). A census
 * that knows only the attribute form under-counts the one surface that hosts
 * the most contextual links, which is exactly the surface this milestone adds
 * to. Both forms are matched, and the unit tests below drive each one.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { shippedSourceFiles, withoutComments } from "@/__tests__/helpers/source-scan";
import { ROUTES } from "@/lib/routes";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

/**
 * The surfaces that ARE the navigation, excluded from the census because a
 * route being in the nav is the very thing this file refuses to accept as
 * reachability. Written as repo-relative paths so the existence assertion
 * below fails loudly if either is moved or renamed.
 */
const NAV_SURFACES = [
  "src/app/components/site-nav.tsx",
  "src/app/components/keyboard-help.tsx",
] as const;

/**
 * Anchors for the blindness control, named as FILES in different directories
 * rather than derived from the walk. A control that takes its expectation from
 * the thing it is checking is not a control: if discovery went blind to nested
 * route folders, a loop over the discovered list would shrink with it and still
 * report a clean census of nothing. `page.tsx` is the dashboard (the hub that
 * hosts most contextual links) and `focus/page.tsx` is a nested route that
 * carries a real loop link, so a walk that cannot see both means nothing.
 */
const BLINDNESS_ANCHORS = ["src/app/page.tsx", "src/app/focus/page.tsx"];

/**
 * The number of shipped files under `src/app` when this guard was written (31,
 * minus the two nav surfaces = 29 scanned). A FLOOR, not an equality: adding a
 * component must not require editing this file, but a walk that suddenly sees
 * three files has gone blind and must say so.
 */
const SCAN_FLOOR = 25;

/** Repo-relative, forward-slashed, so assertions read the same on both OSes. */
function relative(absolute: string): string {
  return path.relative(ROOT, absolute).replace(/\\/g, "/");
}

/**
 * Every literal route target in a source string, in both forms the app uses.
 * Pure, so the unit tests below can drive it with synthetic input instead of
 * perturbing the tree.
 *
 * Trailing slashes are normalised away because `routes.ts` writes every path
 * without one; `/` itself is preserved.
 */
export function routeTargetsIn(source: string): string[] {
  const clean = withoutComments(source);
  const found = new Set<string>();

  for (const pattern of [/href=\{?"(\/[^"]*)"/g, /href:\s*"(\/[^"]*)"/g]) {
    for (const match of clean.matchAll(pattern)) {
      const target = match[1].replace(/\/+$/, "");
      found.add(target === "" ? "/" : target);
    }
  }

  return [...found].sort();
}

/** The files the census reads: every shipped `src/app` file bar the nav. */
export function censusFiles(): string[] {
  return shippedSourceFiles(APP_DIR)
    .map(relative)
    .filter((file) => !NAV_SURFACES.includes(file as (typeof NAV_SURFACES)[number]))
    .sort();
}

/**
 * route path -> the files that link to it. Pure over its input so the negative
 * controls can hand it a synthetic corpus.
 */
export function doorCensus(corpus: readonly { file: string; source: string }[]): Map<string, string[]> {
  const doors = new Map<string, string[]>();

  for (const { file, source } of corpus) {
    for (const target of routeTargetsIn(source)) {
      doors.set(target, [...(doors.get(target) ?? []), file]);
    }
  }

  return doors;
}

const SCANNED = censusFiles();
const CORPUS = SCANNED.map((file) => ({
  file,
  source: readFileSync(path.join(ROOT, file), "utf-8"),
}));
const DOORS = doorCensus(CORPUS);

describe("route door census: the scan can see the app", () => {
  it("reads a real corpus, and a blind walk fails instead of reporting a clean census", () => {
    expect(
      SCANNED.length,
      "the walk found no shipped files under src/app at all, so every result below is vacuous",
    ).toBeGreaterThan(0);
    expect(
      SCANNED.length,
      `the walk found ${SCANNED.length} files, fewer than the ${SCAN_FLOOR} this census was written against; it is blind to nested directories`,
    ).toBeGreaterThanOrEqual(SCAN_FLOOR);

    for (const anchor of BLINDNESS_ANCHORS) {
      expect(
        SCANNED,
        `the walk never reached ${anchor}, one of the two files this census was written for`,
      ).toContain(anchor);
    }

    // A corpus of empty files would satisfy the file-count assertions above
    // while finding no doors at all, so the census needs a floor of its own.
    expect(
      DOORS.size,
      "the corpus was read but no href literal was found anywhere; the matcher, not the app, is broken",
    ).toBeGreaterThan(0);
  });

  it("excludes the nav surfaces, and knows if one is renamed out from under it", () => {
    for (const surface of NAV_SURFACES) {
      expect(
        shippedSourceFiles(APP_DIR).map(relative),
        `${surface} is not on disk, so excluding it from the census is a no-op and the nav is ` +
          "counting itself as a second door again",
      ).toContain(surface);
      expect(SCANNED, `${surface} was scanned; the nav must not vouch for its own routes`).not.toContain(
        surface,
      );
    }
  });
});

describe("route door census: the matcher", () => {
  it("reads both href forms and normalises trailing slashes (negative control)", () => {
    expect(routeTargetsIn('<Link href="/pricing">Pricing</Link>')).toEqual(["/pricing"]);
    expect(routeTargetsIn('const rail = [{ href: "/focus" }];')).toEqual(["/focus"]);
    expect(routeTargetsIn('<Link href={"/journal"} />')).toEqual(["/journal"]);
    expect(routeTargetsIn('href="/trends/"')).toEqual(["/trends"]);
    expect(routeTargetsIn('href="/"')).toEqual(["/"]);

    // A derived href is NOT a door: it is the registry linking to itself.
    expect(routeTargetsIn("<Link href={route.path} />")).toEqual([]);
    // Neither is an external link.
    expect(routeTargetsIn('<a href="https://example.com/slicer" />')).toEqual([]);
  });

  it("does not accept prose as a door", () => {
    // This is the difference between a census and an existence grep, and it is
    // load bearing: this very file's module doc names all six routes.
    expect(routeTargetsIn('// see href="/slicer" for the rail\n')).toEqual([]);
    expect(routeTargetsIn('/* the dashboard links href: "/ambient" */')).toEqual([]);
  });

  it("attributes every door to the file it came from, and reports none as none", () => {
    const census = doorCensus([
      { file: "a.tsx", source: '<Link href="/breathe" />' },
      { file: "b.tsx", source: 'const x = { href: "/breathe" };' },
      { file: "c.tsx", source: "<Link href={somewhere} />" },
    ]);

    expect(census.get("/breathe")).toEqual(["a.tsx", "b.tsx"]);
    expect(census.get("/challenges")).toBeUndefined();
    // The blinded-corpus shape: an empty scan must report every route as
    // doorless rather than agreeing that everything is fine.
    expect(doorCensus([]).size).toBe(0);
  });
});

describe("route door census: no primary-nav route is reachable only from the header", () => {
  it("gives every inPrimaryNav route at least one door outside the nav", () => {
    const primary = ROUTES.filter((route) => route.inPrimaryNav);

    // Guards the assertion below against a registry that has emptied out.
    expect(primary.length, "no route is marked inPrimaryNav; the check below is vacuous").toBeGreaterThan(
      0,
    );

    const doorless = primary.map((route) => route.path).filter((route) => !DOORS.has(route));

    expect(
      doorless,
      "these routes are linked from nowhere in the app except the primary nav and the keyboard " +
        "dialog, so collapsing or shortening the header would take away their only affordance. " +
        "Give each one a contextual in-app entry point (the dashboard is the hub), or take it out " +
        "of the primary nav deliberately. See docs/design/NAV_SHAPE.md section 1c.",
    ).toEqual([]);
  });

  it("names the six routes v0.23 PR1 gave a second door, so a silent removal fails", () => {
    // Not a restatement of the assertion above: that one follows the registry
    // and would go quiet if a route were dropped from the nav. These six are
    // the milestone's actual deliverable and losing any of them is a
    // regression whether or not it is still in the nav.
    for (const route of ["/slicer", "/ambient", "/breathe", "/challenges", "/trends", "/journal"]) {
      expect(
        DOORS.get(route) ?? [],
        `${route} has no in-app link outside the nav again; v0.23 PR1 added one and something ` +
          "removed it",
      ).not.toEqual([]);
    }
  });

  it("leaves /monetization with the single collapsed door v0.22 chose for it", () => {
    // The census checks inPrimaryNav routes only, so this is the assertion that
    // "not checked" did not quietly become "not linked at all".
    expect(
      DOORS.get("/monetization"),
      "the dashboard's collapsed Workspace insights disclosure no longer links to the internal " +
        "analytics view, which would make it reachable only by typing the URL",
    ).toEqual(["src/app/page.tsx"]);
  });
});
