/**
 * The route registry must describe the app that actually shipped, and the
 * surfaces that navigate must render exactly what it says.
 *
 * Source A: every `src/app/**\/page.tsx`, glob-discovered from the real tree
 *   (never hand-listed, so a fourteenth route is judged the moment it exists).
 * Source B: `src/lib/routes.ts`, the registry those pages are described by.
 * Source C: the DOM `<SiteNav />` actually renders, so "the nav is derived" is
 *   asserted from output rather than from the shape of the component's source.
 * Source D: `GO_TO_TARGETS` in `keyboard-help.tsx`, the chord table
 *   `router.push` really reads, held equal to the registry's `goToKey` fields
 *   until v0.22 PR2 makes the dialog derive from the registry outright.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Four independent hardcoded lists decided where a person could go, and
 * nothing compared any of them to the routes that exist. That is not a
 * hypothetical drift risk; it had already produced two shipped defects by the
 * time v0.22 was scoped (`docs/design/ROUTE_VOCABULARY.md` section 1, verified
 * at source):
 *
 *   1. `/now` was in NO navigation surface. The calm single-task timer that
 *      v0.12 built a whole `/trends` card around was reachable only from the
 *      dashboard action rail.
 *   2. `/monetization`, an internal analytics view by its own copy, was a peer
 *      of Journal and Breathe in the primary nav.
 *
 * Neither is a bug a type checker or a build can see, because every list was
 * internally consistent. Only a test that reads the filesystem and the
 * rendered DOM together can tell.
 *
 * WHAT IS DELIBERATELY NOT GUARDED
 * --------------------------------
 * `SwipeStepCard`'s `previousHref`/`nextHref` (the daily focus -> execute ->
 * review sequence) and the dashboard action rail's hrefs. The sequence is a
 * different concept from the navigation vocabulary, and the rail is a set of
 * editorial calls-to-action rather than a route list; folding either into this
 * registry would invent a concept the product does not have. Recorded here so
 * a later reader does not file the omission as drift this guard missed.
 */

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { existsSync } from "node:fs";
import { shippedSourceFiles } from "@/__tests__/helpers/source-scan";
import { ROUTES, goToRoutes, primaryNavRoutes } from "@/lib/routes";
import { SiteNav } from "@/app/components/site-nav";
import { GO_TO_TARGETS } from "@/app/components/keyboard-help";

// `SiteNav` reads the pathname; `keyboard-help` imports `useRouter` at module
// scope even though this suite never renders the dialog, and a mocked module
// throws on an undeclared named export the moment one is touched.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {} }),
}));

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

/**
 * Anchors for the blindness control, named as ROUTES rather than as a
 * directory. A control that derives its expectation from the thing it checks
 * is not a control: if discovery went blind to nested route folders, a loop
 * over the discovered list would shrink with it and still report a clean
 * sweep. `/` is the only page file at the top level and `/monetization` is the
 * route this milestone moves, so a walk that cannot see both is a walk whose
 * result means nothing.
 */
const BLINDNESS_ANCHORS = ["/", "/monetization"];

/**
 * The floor is the route count at the time this guard was written (13). It is
 * a floor and not an equality: adding a route must not require editing this
 * file, but losing most of them silently must fail.
 */
const ROUTE_FLOOR = 13;

/** `src/app/page.tsx` -> `/`, `src/app/now/page.tsx` -> `/now`. Pure. */
export function routePathFromPageFile(relativePath: string): string {
  const withoutFile = relativePath
    .replace(/\\/g, "/")
    .replace(/^src\/app\/?/, "")
    .replace(/page\.tsx$/, "")
    .replace(/\/+$/, "");

  return withoutFile === "" ? "/" : `/${withoutFile}`;
}

/** Every route the filesystem actually ships, discovered, never enumerated. */
export function discoverRoutePaths(): string[] {
  return shippedSourceFiles(APP_DIR)
    .map((absolute) => path.relative(ROOT, absolute).replace(/\\/g, "/"))
    .filter((file) => /^src\/app\/(?:.+\/)?page\.tsx$/.test(file))
    .map(routePathFromPageFile)
    .sort();
}

/**
 * The two directions drift can run, reported separately so a failure says
 * which one happened. Pure, so the negative controls below can drive it with
 * synthetic input instead of perturbing the tree.
 */
export function compareRoutes(
  discovered: readonly string[],
  registered: readonly string[],
): { missingFromRegistry: string[]; missingPageFile: string[] } {
  return {
    missingFromRegistry: discovered.filter((route) => !registered.includes(route)).sort(),
    missingPageFile: registered.filter((route) => !discovered.includes(route)).sort(),
  };
}

const DISCOVERED = discoverRoutePaths();
const REGISTERED = ROUTES.map((route) => route.path);

function renderedNavLinks(): { href: string | null; label: string }[] {
  render(createElement(SiteNav));
  return screen
    .getAllByRole("link")
    .map((link) => ({ href: link.getAttribute("href"), label: link.textContent ?? "" }));
}

describe("route registry: discovery", () => {
  it("discovers the routes it judges (zero-match hard failure)", () => {
    // Without this the suite passes loudest exactly when it is broken: an empty
    // discovery makes every comparison below vacuously agreeable.
    expect(
      DISCOVERED.length,
      "the walk found no page.tsx under src/app at all, so every result below is vacuous",
    ).toBeGreaterThan(0);
    expect(
      DISCOVERED.length,
      `the walk found fewer than ${ROUTE_FLOOR} routes; it is blind to nested route directories`,
    ).toBeGreaterThanOrEqual(ROUTE_FLOOR);

    for (const anchor of BLINDNESS_ANCHORS) {
      expect(
        DISCOVERED,
        `the walk never reached ${anchor}, one of the two routes this guard was written for`,
      ).toContain(anchor);
    }
  });

  it("maps page files to routes, and reports drift in both directions (negative control)", () => {
    expect(routePathFromPageFile("src/app/page.tsx")).toBe("/");
    expect(routePathFromPageFile("src/app/now/page.tsx")).toBe("/now");
    expect(routePathFromPageFile("src/app/a/b/page.tsx")).toBe("/a/b");
    // Windows separators must not produce a different route than POSIX ones.
    expect(routePathFromPageFile("src\\app\\journal\\page.tsx")).toBe("/journal");

    // A shipped page nobody registered.
    expect(compareRoutes(["/", "/ghost"], ["/"])).toEqual({
      missingFromRegistry: ["/ghost"],
      missingPageFile: [],
    });
    // A registry entry whose page has been deleted.
    expect(compareRoutes(["/"], ["/", "/vanished"])).toEqual({
      missingFromRegistry: [],
      missingPageFile: ["/vanished"],
    });
    // The blinded-discovery shape: if the walk ever returns nothing, the
    // comparison must report every registered route rather than agree.
    expect(compareRoutes([], REGISTERED).missingPageFile).toEqual([...REGISTERED].sort());
  });
});

describe("route registry: the registry matches the shipped tree", () => {
  it("registers every shipped route and ships every registered route", () => {
    const { missingFromRegistry, missingPageFile } = compareRoutes(DISCOVERED, REGISTERED);

    expect(
      missingFromRegistry,
      "these routes have a page.tsx but no entry in src/lib/routes.ts, so nothing decides " +
        "whether a person is allowed to find them",
    ).toEqual([]);
    expect(
      missingPageFile,
      "these entries in src/lib/routes.ts name a route with no page.tsx, so the nav or the " +
        "keyboard dialog can advertise a 404",
    ).toEqual([]);
  });

  it("keeps every entry addressable and every label distinct", () => {
    for (const route of ROUTES) {
      expect(route.path.startsWith("/"), `${route.path} is not an absolute path`).toBe(true);
      expect(
        route.path === "/" || !route.path.endsWith("/"),
        `${route.path} carries a trailing slash; hrefs in this app are written without one`,
      ).toBe(true);
      expect(route.label.trim().length, `${route.path} has no label`).toBeGreaterThan(0);
    }

    expect(new Set(REGISTERED).size, "two entries share a path").toBe(REGISTERED.length);
    const labels = ROUTES.map((route) => route.label);
    expect(new Set(labels).size, "two entries share a label").toBe(labels.length);
  });
});

describe("route registry: the primary nav is derived from it", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders exactly the routes marked inPrimaryNav, in registry order", () => {
    const expected = primaryNavRoutes().map((route) => ({ href: route.path, label: route.label }));

    expect(
      renderedNavLinks(),
      "the rendered nav does not match the registry: a link added or removed by hand in " +
        "site-nav.tsx, or an entry whose inPrimaryNav flag says otherwise",
    ).toEqual(expected);
  });

  it("puts /now in the front door (v0.22 D4)", () => {
    const links = renderedNavLinks();
    const now = links.find((link) => link.href === "/now");

    expect(
      now,
      "/now is in no navigation surface again: it was reachable only from the dashboard " +
        "action rail before v0.22, which is the defect this milestone fixed",
    ).toBeDefined();
    expect(now?.label).toBe("Now");
    // Directly after Dashboard: it is the one route useful with no plan, no
    // check-in and no account.
    expect(links.map((link) => link.href).slice(0, 2)).toEqual(["/", "/now"]);
  });

  it("keeps /monetization out of the front door without deleting it (v0.22 D3)", () => {
    const hrefs = renderedNavLinks().map((link) => link.href);

    expect(
      hrefs,
      "the internal analytics view is back in the primary nav, one slot from Pricing, where " +
        "a first-time visitor meets a link named after the business model",
    ).not.toContain("/monetization");

    // "Out of the nav" and "deleted" must never be confusable: the route is
    // still registered, still internal, still on disk, and the dashboard's
    // collapsed Workspace insights disclosure still links to it.
    const entry = ROUTES.find((route) => route.path === "/monetization");
    expect(entry, "/monetization lost its registry entry entirely").toBeDefined();
    expect(entry?.audience).toBe("internal");
    expect(entry?.inPrimaryNav).toBe(false);
    expect(
      existsSync(path.join(APP_DIR, "monetization", "page.tsx")),
      "the monetization page file is gone; D3 removes it from the nav and changes nothing else",
    ).toBe(true);
  });
});

describe("route registry: the chord table agrees with it", () => {
  it("matches keyboard-help's GO_TO_TARGETS entry for entry", () => {
    // Source D. Until PR2 derives the dialog from the registry, these are two
    // copies, so the guard holds them equal rather than trusting a comment.
    const fromRegistry = Object.fromEntries(
      goToRoutes().map((route) => [route.goToKey as string, route.path]),
    );

    expect(
      GO_TO_TARGETS,
      "the g-chord table and src/lib/routes.ts disagree about which key reaches which route",
    ).toEqual(fromRegistry);
  });

  it("assigns each chord key to exactly one route", () => {
    const keys = goToRoutes().map((route) => route.goToKey);
    expect(new Set(keys).size, "two routes claim the same g chord").toBe(keys.length);
  });
});
