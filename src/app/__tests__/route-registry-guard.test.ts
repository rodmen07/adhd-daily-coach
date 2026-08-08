/**
 * The route registry must describe the app that actually shipped, and the
 * surfaces that navigate must render exactly what it says.
 *
 * Source A: every `src/app/**\/page.tsx`, glob-discovered from the real tree
 *   (never hand-listed, so a fourteenth route is judged the moment it exists).
 * Source B: `src/lib/routes.ts`, the registry those pages are described by.
 * Source C: the DOM `<SiteNav />` actually renders, so "the nav is derived" is
 *   asserted from output rather than from the shape of the component's source.
 *   As of v0.23 that DOM has two halves - the inline pills and the "More"
 *   disclosure - and this guard reads WHICH half each route landed in, not
 *   just that the set is complete. A route silently moving behind the
 *   disclosure is the failure this milestone's own design warns about.
 *   As of v0.24 the panel half is four labelled lists rather than one, and
 *   this guard reads the label through `aria-labelledby` rather than by
 *   position, so four headings that name nothing cannot pass as a taxonomy.
 *   Because a category is NOT a contiguous run of the registry, the rendered
 *   order genuinely changed here: every assertion that used to be a single
 *   full-order equality against registry order is now a full-order equality
 *   against the GROUPED derivation plus a separate set assertion, so the
 *   regrouping cannot hide a route that stopped rendering.
 * Source D: the keyboard help dialog `<KeyboardHelp />` actually renders, plus
 *   the `router.push` a real `g` chord actually performs. v0.22 PR1 held the
 *   exported `GO_TO_TARGETS` table equal to the registry's `goToKey` fields;
 *   PR2 derives that table from the registry, which makes the equality
 *   tautological, so it is replaced here by assertions on rendered rows and on
 *   navigation that a derivation regression can still fail.
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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { existsSync } from "node:fs";
import { shippedSourceFiles } from "@/__tests__/helpers/source-scan";
import {
  ROUTES,
  goToRouteGroups,
  goToRoutes,
  inlineNavRoutes,
  moreNavGroups,
  moreNavRoutes,
  navGroupSections,
  primaryNavRoutes,
} from "@/lib/routes";
import { SiteNav } from "@/app/components/site-nav";
import { KeyboardHelp } from "@/app/components/keyboard-help";

// `SiteNav` reads the pathname; `KeyboardHelp` pushes onto the router, and the
// chord assertions below read what it pushed, so the spy is the source of
// truth for "this chord really navigates" rather than a table lookup.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push }),
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

/**
 * The chord count at the time PR2 derived the dialog (7: the six v0.21 chords
 * plus `g n` for `/now`). A floor for the same reason `ROUTE_FLOOR` is one: the
 * row assertions below compare a generated list against a generated list, so an
 * empty registry would satisfy them vacuously. Adding a chord must not require
 * editing this file; losing them all must fail.
 */
const CHORD_FLOOR = 7;

/**
 * v0.23 D2/D3: exactly three routes are inline, and this is an EQUALITY rather
 * than a floor because three is the whole finding. Four items (three links
 * plus the More disclosure) is the largest set that stays on one row at
 * 375x667; five wraps to two rows and 180 px. An extra inline route is
 * therefore not a preference, it is a silent regression of the measurement
 * `e2e/nav-shape.spec.ts` enforces in a real browser - and this assertion is
 * the cheap one that names the reason, in the gate, without a build.
 */
const INLINE_SLOT_COUNT = 3;

/**
 * v0.24 D3: the group assertions below compare one derived list against
 * another, so a registry whose entries all fell into ONE category - or into
 * none - would satisfy them while proving nothing. Two is the floor at which
 * "grouped" stops being a synonym for "the same flat list with a heading over
 * it"; D3 ships four. A floor rather than an equality for the same reason
 * `ROUTE_FLOOR` is one: adding a fifth category must not require editing this
 * file, and collapsing them all into one must fail.
 */
const NAV_GROUP_FLOOR = 2;

/**
 * The rows D6 leaves hand authored, listed here rather than derived, because
 * they are exactly the behaviour that is NOT a route: this is the assertion
 * that generating the navigation rows did not swallow them.
 */
const NON_NAVIGATION_ROWS = [
  "Open this help",
  "Close this help",
  "Previous or next step while a step card is focused",
  "Move focus between controls",
  "Activate the focused control",
];

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

/** Read `href` off a live anchor list, in DOM order. */
function hrefsOf(nodes: Iterable<Element>): (string | null)[] {
  return Array.from(nodes, (node) => node.getAttribute("href"));
}

/**
 * The two halves of the v0.23 header, read from the rendered DOM.
 *
 * The inline set is queried as DIRECT anchor children of the nav, so a link
 * that moved inside the disclosure stops counting as inline - which is the
 * whole point. Querying `.site-nav-links a` instead would return both halves
 * and the split would be unfalsifiable.
 */
function renderedNavShape(): { inline: (string | null)[]; more: (string | null)[] } {
  render(createElement(SiteNav));
  const nav = screen.getByRole("navigation", { name: "Primary" });

  return {
    inline: hrefsOf(nav.querySelectorAll(":scope > a")),
    more: hrefsOf(nav.querySelectorAll(".site-nav-more .site-nav-more-panel a")),
  };
}

type RenderedGroup = {
  /** The text of the element `aria-labelledby` actually points at. */
  heading: string;
  /** The tag of that element, so an `aria-label` string cannot pass as one. */
  headingTag: string;
  hrefs: (string | null)[];
};

/**
 * The "More" panel read as labelled lists (v0.24 D4).
 *
 * Deliberately resolved through `aria-labelledby` rather than by reading the
 * heading that happens to sit above each list: D4's whole requirement is that
 * the label is a REAL element a sighted reader sees AND the accessible name of
 * the list, and a panel that renders four headings with no association between
 * them and the lists would pass a positional read while giving a screen-reader
 * user the same undifferentiated nine items section 1a found.
 */
function renderedMoreGroups(): { groups: RenderedGroup[]; linkTotal: number; groupedLinks: number } {
  render(createElement(SiteNav));
  const panel = screen
    .getByRole("navigation", { name: "Primary" })
    .querySelector<HTMLElement>(".site-nav-more .site-nav-more-panel");

  expect(panel, "the header has no More panel at all").not.toBeNull();

  const groups = Array.from(panel!.querySelectorAll("ul")).map((list) => {
    const labelledBy = list.getAttribute("aria-labelledby");
    // `getElementById` rather than a `#id` selector: React's `useId` emits
    // guillemets, which a CSS selector would have to escape.
    const heading = labelledBy === null ? null : panel!.ownerDocument.getElementById(labelledBy);

    return {
      heading: heading?.textContent?.trim() ?? "",
      headingTag: heading?.tagName ?? "",
      hrefs: hrefsOf(list.querySelectorAll(":scope > li > a")),
    };
  });

  return {
    groups,
    linkTotal: panel!.querySelectorAll("a").length,
    groupedLinks: groups.reduce((total, group) => total + group.hrefs.length, 0),
  };
}

/**
 * The "More" disclosure, rendered and opened, for the v0.24 D7 assertions.
 *
 * It is opened by setting `open` directly rather than by clicking the summary
 * because jsdom does not implement the summary's activation behaviour, so a
 * click there would leave the panel closed and every assertion downstream
 * would read a state no reader ever sees. The vacuity checks here are the
 * price of that shortcut: if the disclosure or its links stopped rendering,
 * "the menu is closed" would be trivially true and these tests would report a
 * beautifully dismissable menu that does not exist.
 */
function openedDisclosure(): {
  disclosure: HTMLDetailsElement;
  summary: HTMLElement;
  links: HTMLAnchorElement[];
} {
  render(createElement(SiteNav));
  const disclosure = screen
    .getByRole("navigation", { name: "Primary" })
    .querySelector<HTMLDetailsElement>(".site-nav-more");
  expect(disclosure, "the header has no More disclosure at all").not.toBeNull();

  const summary = disclosure!.querySelector<HTMLElement>(":scope > summary");
  expect(summary, "the More disclosure has no summary to return focus to").not.toBeNull();

  disclosure!.open = true;
  const links = Array.from(
    disclosure!.querySelectorAll<HTMLAnchorElement>(".site-nav-more-panel a"),
  );
  expect(
    links.length,
    "the More panel rendered no links, so an assertion about dismissing it would " +
      "be about an empty box",
  ).toBeGreaterThan(0);

  return { disclosure: disclosure!, summary: summary!, links };
}

/**
 * The keyboard dialog read as sections: the heading each run of rows sits
 * under (empty for the two hand-authored runs) and the descriptions in it.
 */
function renderedShortcutSections(): { heading: string; descriptions: string[] }[] {
  render(createElement(KeyboardHelp));
  fireEvent.keyDown(window, { key: "?" });
  const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });

  return Array.from(dialog.querySelectorAll(".shortcut-section")).map((section) => ({
    heading: section.querySelector(".shortcut-group-heading")?.textContent?.trim() ?? "",
    descriptions: Array.from(section.querySelectorAll(".shortcut-desc")).map(
      (node) => node.textContent ?? "",
    ),
  }));
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

  it("renders exactly the routes marked inPrimaryNav, in the order the header lays them out", () => {
    // Until v0.24 this was flat registry order, because the header was one
    // list. It now renders the inline pills in registry order and then the
    // panel's categories, and a category is not a contiguous run of the
    // registry - so the expectation is DERIVED from the same two functions the
    // component reads rather than relaxed to a set comparison. Both halves stay
    // a full-order equality; what changed is which order is correct.
    const expected = [
      ...inlineNavRoutes(),
      ...moreNavGroups().flatMap((section) => section.routes),
    ].map((route) => ({ href: route.path, label: route.label }));

    expect(
      expected.map((link) => link.href).sort(),
      "the inline half plus the grouped panel is no longer the whole primary nav",
    ).toEqual(primaryNavRoutes().map((route) => route.path).sort());

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

describe("route registry: the header's two halves are declared, not positional (v0.23 D6)", () => {
  afterEach(() => {
    cleanup();
  });

  it("gives every primary-nav route a slot, and no other route one", () => {
    for (const route of primaryNavRoutes()) {
      expect(
        route.navSlot,
        `${route.path} is in the primary nav with no navSlot, so the header has to guess ` +
          "whether it is a pill or a More entry - the positional rule D6 rejected",
      ).toBeDefined();
      expect(["inline", "more"]).toContain(route.navSlot);
    }

    for (const route of ROUTES.filter((entry) => !entry.inPrimaryNav)) {
      expect(
        route.navSlot,
        `${route.path} is not in the primary nav but carries a navSlot, which reads as a ` +
          "header placement for a route the header never renders",
      ).toBeUndefined();
    }
  });

  it("keeps exactly three routes inline, the measured one-row maximum (D2)", () => {
    const inline = inlineNavRoutes();
    const more = moreNavRoutes();

    expect(
      inline.map((route) => route.path),
      `${inline.length} routes are inline, not ${INLINE_SLOT_COUNT}: four header items is the ` +
        "largest set that stays on one row at 375x667, and a fifth wraps the header back to " +
        "two rows - see e2e/nav-shape.spec.ts, which measures it in a real browser",
    ).toHaveLength(INLINE_SLOT_COUNT);

    // The split is a partition, not two independent lists: every primary-nav
    // route is in exactly one half, and together they are the whole nav in
    // registry order. Without this a route could be dropped from both and the
    // two assertions above would still pass.
    expect(
      [...inline, ...more].map((route) => route.path),
      "the two halves are not a partition of the primary nav: a route is in both, in " +
        "neither, or the halves are no longer in registry order",
    ).toEqual(primaryNavRoutes().map((route) => route.path));
  });

  it("renders each half where its slot says, not where its position says", () => {
    const { inline, more } = renderedNavShape();

    expect(
      inline,
      "the header's inline pills are not the routes marked navSlot: \"inline\" - a link was " +
        "hand-written into site-nav.tsx, or a route moved between the halves without its " +
        "registry entry moving with it",
    ).toEqual(inlineNavRoutes().map((route) => route.path));

    // Since v0.24 the panel lays these out by category rather than in flat
    // registry order, so the expectation is the grouped derivation; the SET is
    // asserted separately against `moreNavRoutes()` so the regrouping cannot
    // hide a route that stopped rendering.
    expect(
      [...more].sort(),
      "the More disclosure does not hold exactly the routes marked navSlot: \"more\", so a " +
        "route is either advertised twice or reachable from neither half of the header",
    ).toEqual(moreNavRoutes().map((route) => route.path).sort());

    expect(
      more,
      "the More disclosure holds the right routes in the wrong places: they are no longer " +
        "laid out by category in registry order",
    ).toEqual(moreNavGroups().flatMap((section) => section.routes.map((route) => route.path)));
  });

  it("closes the disclosure when a link inside it is chosen", () => {
    // Client-side navigation does not remount SiteNav and <details> keeps its
    // open state in the DOM rather than in React, so without the handler this
    // asserts, the menu stays open over the page the reader just navigated to.
    // A behaviour a reader sees, therefore a behaviour with a test: removing
    // the onClick makes this red while every other assertion here stays green.
    render(createElement(SiteNav));
    const disclosure = screen
      .getByRole("navigation", { name: "Primary" })
      .querySelector<HTMLDetailsElement>(".site-nav-more");

    expect(disclosure, "the header has no More disclosure at all").not.toBeNull();
    disclosure!.open = true;

    const firstMoreLink = disclosure!.querySelector<HTMLAnchorElement>(
      ".site-nav-more-panel a",
    );
    expect(firstMoreLink, "the More panel rendered no links").not.toBeNull();
    // jsdom implements an anchor's default action as a real navigation and
    // logs "Not implemented" for it. Cancelling the default keeps the suite's
    // output honest without touching the handler under test: React's listener
    // is delegated at the root and still runs, which is exactly what the
    // assertion below reads.
    firstMoreLink!.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(firstMoreLink!);

    expect(
      disclosure!.open,
      "choosing a route left the More menu hanging open over the page it navigated to",
    ).toBe(false);
  });
});

describe("route registry: the More disclosure behaves like a menu (v0.24 D7)", () => {
  afterEach(() => {
    cleanup();
  });

  it("closes on Escape and returns focus to its summary", () => {
    const { disclosure, summary, links } = openedDisclosure();

    // Focus starts on a link INSIDE the panel, which is where a keyboard
    // reader who pressed Escape actually is. Without that, "focus is on the
    // summary afterwards" could be true because focus never moved at all.
    links[links.length - 1].focus();
    expect(
      document.activeElement,
      "the fixture could not put focus inside the panel, so the assertion below " +
        "would prove nothing about focus MOVING",
    ).toBe(links[links.length - 1]);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      disclosure.open,
      "Escape left the More menu hanging open: nine of the twelve routes stay " +
        "over the page with no keyboard way to dismiss them",
    ).toBe(false);
    expect(
      document.activeElement,
      "Escape closed the menu but left focus on a link that is no longer visible, " +
        "which is worse for a keyboard reader than not closing at all (D7)",
    ).toBe(summary);
  });

  it("leaves the disclosure alone on a key that is not Escape", () => {
    const { disclosure } = openedDisclosure();

    fireEvent.keyDown(document, { key: "m" });

    // Discrimination, not decoration: a handler that closed on ANY keydown
    // would satisfy the assertion above while making the panel impossible to
    // read with the keyboard, since the first Tab press would dismiss it.
    expect(
      disclosure.open,
      "a keystroke that is not Escape closed the More menu, so the handler is " +
        "reading that a key was pressed rather than which one",
    ).toBe(true);
  });

  it("does nothing at all while the disclosure is closed", () => {
    // Both handlers are attached to `document` for the life of the mount, and
    // the header is on every route, so the closed state is where they spend
    // essentially all of their time. A version that returned focus on every
    // Escape - or read containment before reading `open` - would yank focus
    // into the header from anywhere in the app on a key most surfaces use to
    // dismiss something of their own.
    const { disclosure, links } = openedDisclosure();
    disclosure.open = false;
    links[0].focus();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(document.body);

    expect(disclosure.open, "a closed disclosure opened itself").toBe(false);
    expect(
      document.activeElement,
      "Escape moved focus into the header while the More menu was closed, so every " +
        "page that uses Escape for its own dismissal loses the reader's place",
    ).toBe(links[0]);
  });

  it("closes on a pointer-down outside the disclosure", () => {
    const { disclosure } = openedDisclosure();

    fireEvent.pointerDown(document.body);

    expect(
      disclosure.open,
      "pointing at the page outside the menu left it open, so the only way to " +
        "dismiss it with a mouse is to find the summary again",
    ).toBe(false);
  });

  it("stays open on a pointer-down inside the panel", () => {
    const { disclosure, links } = openedDisclosure();

    fireEvent.pointerDown(links[0]);

    // The other half of the same discrimination: "close on any pointer-down"
    // passes the assertion above and breaks the menu, because pressing a link
    // inside the panel is itself a pointer-down and would dismiss the panel
    // out from under the press.
    expect(
      disclosure.open,
      "pressing a link inside the panel dismissed it, so the outside-click " +
        "handler is closing on any pointer-down rather than on containment",
    ).toBe(true);
  });
});

describe("route registry: every front door has a category and a chord (v0.24 D2/D3/D6)", () => {
  afterEach(() => {
    cleanup();
  });

  it("splits into enough categories for the assertions below to mean anything", () => {
    const sections = navGroupSections(primaryNavRoutes());

    expect(
      sections.length,
      `the primary nav falls into fewer than ${NAV_GROUP_FLOOR} categories, so every grouped ` +
        "assertion below compares one flat list against another flat list with a heading on it",
    ).toBeGreaterThanOrEqual(NAV_GROUP_FLOOR);
  });

  it("gives every primary-nav route a navGroup, and no other route one (D2)", () => {
    for (const route of primaryNavRoutes()) {
      expect(
        route.navGroup,
        `${route.path} is in the primary nav with no navGroup, so the More panel and the ` +
          "keyboard dialog have nowhere to put it and it silently stops rendering",
      ).toBeDefined();
    }

    for (const route of ROUTES.filter((entry) => !entry.inPrimaryNav)) {
      expect(
        route.navGroup,
        `${route.path} is not in the primary nav but carries a navGroup, which reads as a ` +
          "front-door category for a route the front door never renders",
      ).toBeUndefined();
    }
  });

  it("groups the whole primary nav without losing or duplicating a route (D3)", () => {
    const sections = navGroupSections(primaryNavRoutes());

    // A partition, asserted the same way the inline/more split is: without it a
    // route could be dropped by the grouping and every "the panel renders its
    // group" assertion below would still agree, about a smaller nav.
    expect(
      sections.flatMap((section) => section.routes.map((route) => route.path)).sort(),
      "grouping the primary nav did not return the primary nav: a route is in two categories, " +
        "in none, or was dropped by navGroupSections",
    ).toEqual(primaryNavRoutes().map((route) => route.path).sort());

    expect(
      new Set(sections.map((section) => section.group)).size,
      "two sections carry the same category, so a group is split in two places",
    ).toBe(sections.length);
  });

  it("orders the categories by their first appearance in the registry (D3)", () => {
    // Derived, never a literal list of names: the order is a consequence of the
    // registry, so re-ordering ROUTES must move the headings rather than
    // falsify a hand-written expectation in this file.
    const expected: string[] = [];
    for (const route of primaryNavRoutes()) {
      if (route.navGroup !== undefined && !expected.includes(route.navGroup)) {
        expected.push(route.navGroup);
      }
    }

    expect(
      navGroupSections(primaryNavRoutes()).map((section) => section.group),
      "the categories are not in registry order, so the panel's headings and the registry " +
        "disagree about which concern comes first",
    ).toEqual(expected);

    // The order is canonical to the REGISTRY, not to whichever subset is being
    // rendered. Ordering by first appearance in each surface's own list sounds
    // equivalent and is not: the panel holds no `/`, so its first Today entry
    // is `/focus` and its first In-the-moment entry is `/ambient`, which puts
    // In the moment first there and Today first in the dialog.
    expect(
      navGroupSections(moreNavRoutes()).map((section) => section.group),
      "a subset of the nav orders its categories differently from the whole nav, so two " +
        "surfaces built from the same registry disagree about which concern comes first",
    ).toEqual(
      expected.filter((group) => moreNavRoutes().some((route) => route.navGroup === group)),
    );
  });

  it("gives every primary-nav route a g chord, and no other route one (D6)", () => {
    const chordless = primaryNavRoutes()
      .filter((route) => route.goToKey === undefined)
      .map((route) => route.path);

    expect(
      chordless,
      "these front-door routes are reachable from the keyboard only by tabbing into the More " +
        "disclosure and through it, which is the asymmetry D6 removed",
    ).toEqual([]);

    // The other direction keeps the dialog's grouping TOTAL: a chord on a route
    // with no category would be dropped by navGroupSections and advertised
    // nowhere, while still navigating.
    const ungrouped = goToRoutes()
      .filter((route) => route.navGroup === undefined)
      .map((route) => route.path);

    expect(
      ungrouped,
      "these routes carry a g chord but no navGroup, so the keyboard dialog cannot show them " +
        "and the chord works while nothing advertises it",
    ).toEqual([]);
  });
});

describe("route registry: the More panel renders one labelled list per category (v0.24 D4)", () => {
  afterEach(() => {
    cleanup();
  });

  it("labels each list with a real heading element, not an aria-label string", () => {
    const { groups } = renderedMoreGroups();

    expect(groups.length, "the More panel rendered no labelled lists at all").toBeGreaterThan(0);

    for (const group of groups) {
      expect(
        group.headingTag,
        `a More group is labelled by "${group.heading}" but that label is not a heading ` +
          "element: an invisible-only label fixes the screen reader and leaves a sighted " +
          "reader with the same undifferentiated list D4 was written to remove",
      ).toMatch(/^H[1-6]$/);
      expect(group.heading.length, "a More group heading renders no text").toBeGreaterThan(0);
    }
  });

  it("renders exactly the categories that have a More member, in registry order", () => {
    const { groups } = renderedMoreGroups();

    expect(
      groups.map((group) => group.heading),
      "the panel's headings are not the categories of the routes behind the disclosure: a " +
        "heading was hand written into site-nav.tsx, or a group with no More member is " +
        "rendering an empty section",
    ).toEqual(moreNavGroups().map((section) => section.group));
  });

  it("puts every More route inside the labelled list of its own category", () => {
    const { groups, linkTotal, groupedLinks } = renderedMoreGroups();

    expect(
      groups.map((group) => group.hrefs),
      "a route behind the disclosure is under the wrong heading, or its group's members are " +
        "no longer in registry order",
    ).toEqual(moreNavGroups().map((section) => section.routes.map((route) => route.path)));

    // Every link in the panel is inside a labelled list. Without this a route
    // could be rendered loose next to the groups and the assertion above would
    // still pass while a reader met an item belonging to nothing.
    expect(
      groupedLinks,
      `${linkTotal - groupedLinks} link(s) in the More panel sit outside every labelled list`,
    ).toBe(linkTotal);
  });
});

describe("route registry: the keyboard dialog is derived from it", () => {
  afterEach(() => {
    cleanup();
    push.mockReset();
  });

  /** Open the help dialog and read the descriptions it really rendered. */
  function renderedShortcutDescriptions(): string[] {
    render(createElement(KeyboardHelp));
    fireEvent.keyDown(window, { key: "?" });
    screen.getByRole("dialog", { name: "Keyboard shortcuts" });

    return Array.from(document.querySelectorAll(".shortcut-desc")).map(
      (node) => node.textContent ?? "",
    );
  }

  it("advertises enough chords for the assertions below to mean anything", () => {
    // Both row assertions compare one derived list against another, so an empty
    // registry would make them agree about nothing at all.
    expect(
      goToRoutes().length,
      `fewer than ${CHORD_FLOOR} routes carry a goToKey; the chord assertions below are vacuous`,
    ).toBeGreaterThanOrEqual(CHORD_FLOOR);
  });

  it("renders one 'Go to' row per registry chord, in grouped registry order, with the registry's label", () => {
    const expected = goToRouteGroups().flatMap((section) =>
      section.routes.map((route) => `Go to ${route.label}`),
    );
    const rendered = renderedShortcutDescriptions().filter((row) => row.startsWith("Go to "));

    expect(
      rendered,
      "the dialog's navigation rows are not the registry's chords: a row was hand written back " +
        "into keyboard-help.tsx, a chord lost its row, or a label was restated instead of read",
    ).toEqual(expected);

    // A category is NOT a contiguous run of the registry (`/` is Today and
    // `/now` is In the moment), so v0.24 genuinely re-orders these rows and the
    // order assertion above can no longer double as "nothing was lost". The set
    // is therefore asserted separately, against the flat chord list.
    expect(
      [...rendered].sort(),
      "grouping the navigation rows dropped or duplicated a chord: the dialog advertises a " +
        "different SET of destinations than the registry carries",
    ).toEqual(goToRoutes().map((route) => `Go to ${route.label}`).sort());
  });

  it("puts the 'Go to' rows under the registry's categories, in the panel's order (v0.24 D5)", () => {
    const labelled = renderedShortcutSections().filter((section) => section.heading !== "");

    expect(
      labelled.map((section) => section.heading),
      "the dialog's group headings are not the registry's categories in registry order: a " +
        "heading was hand written into keyboard-help.tsx, or the rows are still one flat list",
    ).toEqual(goToRouteGroups().map((section) => section.group));

    expect(
      labelled.map((section) => section.descriptions),
      "a chord is advertised under the wrong category, so the dialog and the More panel " +
        "disagree about what a route is about while reading the same registry",
    ).toEqual(
      goToRouteGroups().map((section) =>
        section.routes.map((route) => `Go to ${route.label}`),
      ),
    );

    // "the same order as the panel", asserted rather than assumed: the panel
    // shows only the categories with a route behind the disclosure, so its
    // heading order must be this one restricted to those.
    cleanup();
    const panelHeadings = renderedMoreGroups().groups.map((group) => group.heading);

    expect(
      labelled
        .map((section) => section.heading)
        .filter((heading) => panelHeadings.includes(heading)),
      "the keyboard dialog and the More panel order the same categories differently, so the " +
        "two surfaces teach a reader two different shapes for the same twelve routes",
    ).toEqual(panelHeadings);
  });

  it("keeps the five non-navigation rows (v0.22 D6)", () => {
    const rendered = renderedShortcutDescriptions().filter((row) => !row.startsWith("Go to "));

    expect(
      rendered,
      "generating the navigation rows dropped or reordered the rows that describe behaviour " +
        "which is not a route (the help keys, the step-card arrows, Tab and Enter)",
    ).toEqual(NON_NAVIGATION_ROWS);
  });

  it("routes to the registry's path for every chord it advertises", () => {
    for (const route of goToRoutes()) {
      cleanup();
      push.mockReset();
      render(createElement(KeyboardHelp));

      fireEvent.keyDown(window, { key: "g" });
      fireEvent.keyDown(window, { key: route.goToKey });

      expect(
        push,
        `pressing g then ${route.goToKey} did not navigate to ${route.path}, so the dialog ` +
          "advertises a chord the key handler does not implement",
      ).toHaveBeenCalledWith(route.path);
    }
  });

  it("gives /now the g n chord it never had (v0.22 D5)", () => {
    const now = goToRoutes().find((route) => route.path === "/now");

    expect(
      now,
      "/now carries no goToKey again: before v0.22 it was in neither the nav nor the chord table",
    ).toBeDefined();
    expect(now?.goToKey).toBe("n");
    expect(renderedShortcutDescriptions()).toContain("Go to Now");
  });

  it("assigns each chord key to exactly one route", () => {
    const keys = goToRoutes().map((route) => route.goToKey);
    expect(new Set(keys).size, "two routes claim the same g chord").toBe(keys.length);
  });
});
