import { test, expect, APP_ROOT, routeUrl } from "./fixtures";
import { ROUTES } from "@/lib/routes";
import { ROUTE_TITLE_SUFFIX } from "@/app/route-metadata";

/**
 * v0.25 PR2 - "and a screen reader hears it"
 * (docs/design/ROUTE_IDENTITY.md D1, done-when clauses 5 and 6).
 *
 * WHY THIS IS A BROWSER TEST AND NOT A UNIT TEST
 * ----------------------------------------------
 * `src/__tests__/route-title-contract.test.ts` (PR1) already proves the built
 * export carries thirteen distinct `<title>` elements. That is the whole of
 * what a file on disk can tell you. The claim this milestone was actually
 * defined to fix is a RUNTIME one, and it lives in a place no static artifact
 * can be read for:
 *
 *   Next 16's App Router mounts a route announcer
 *   (`next/dist/client/components/app-router-announcer.js`) whose effect body
 *   speaks the destination after a client-side navigation - but only
 *   `if (previousTitle.current !== currentTitle)`, and it reads
 *   `document.title` in PREFERENCE to the page `<h1>`.
 *
 * Until PR1 every route served one identical title, so that condition was
 * never true on any navigation, the announcer node stayed EMPTY, and the
 * `<h1>` fallback that would have rescued it was unreachable precisely
 * BECAUSE a title was always set. A screen-reader user who pressed `g j` - a
 * chord v0.24 shipped specifically to make `/journal` reachable - was told
 * nothing about where they had landed.
 *
 * Nothing in jsdom can observe that: there is no App Router announcer there,
 * no shadow root, no client-side navigation, and no `document.title` written
 * by a framework effect. Nothing in the built HTML can observe it either -
 * the announcer node is created at runtime and is empty in the export. The
 * only instrument that can is a real browser doing a real client-side
 * navigation, which is what this file is.
 *
 * WHAT IT ASSERTS, AND WHY BOTH HALVES ARE NEEDED
 * -----------------------------------------------
 * Clause 5 - `document.title` becomes the destination's expected string AND
 * differs from what it was a moment ago. The "differs" half is not decoration:
 * "the title equals X" would still pass if every route served X, and "every
 * route serves the same string" is the exact defect. The change is the
 * property the announcer's condition reads.
 *
 * Clause 6 - the destination's name lands in the route announcer itself. This
 * is the only assertion in the repo that observes the announcement rather than
 * its precondition. It is deliberately a SEPARATE assertion from the title
 * one: the two are coupled today by the framework, and the day that coupling
 * changes is exactly the day this project needs to be told.
 *
 * WHERE THE EXPECTATION COMES FROM, AND WHERE IT DELIBERATELY DOES NOT
 * -------------------------------------------------------------------
 * Expected titles are composed from the REGISTRY (`ROUTES[i].label`) plus the
 * suffix the root template declares, never from `metadataForRoute()`. That is
 * the same discipline `route-title-contract.test.ts` records: a guard whose
 * expectation is produced by the module under test moves both sides of its own
 * comparison at once and cannot fail. Composing from the registry keeps the
 * consumer perturbable - which is precisely what clause 6's control perturbs.
 *
 * OBSERVED FAILING (the control this file ships with)
 * --------------------------------------------------
 * With `metadataForRoute()` returning `{}` - the pre-v0.25 state, where all
 * thirteen segments fall back to the root default and every title is the same
 * string - rebuilt and rerun, this spec reports the title change assertion red
 * ("the title did not change") and the announcer assertion red against an
 * EMPTY announcer. The exact output is quoted in the PR body. A gate nobody
 * has seen fail is not a gate.
 *
 * The console-error tripwire from ./fixtures is armed automatically.
 */

/**
 * The route announcer's own node, inside the OPEN shadow root on
 * `<next-route-announcer>`. Playwright's CSS engine pierces open shadow roots,
 * so no `evaluate` hop is needed and the assertion can be an auto-retrying
 * web-first one - which is what makes "after the navigation settles" a
 * property of the assertion rather than of a sleep.
 */
const ANNOUNCER = "#__next-route-announcer__";

/**
 * The string the browser should show for a route, composed from the registry
 * entry that already names it. Throws rather than returning a fallback: a path
 * this cannot resolve means the spec and the registry have parted company, and
 * a plausible-looking default would hide that.
 */
function expectedTitle(path: string): string {
  const entry = ROUTES.find((route) => route.path === path);

  if (entry === undefined) {
    throw new Error(
      `e2e/route-identity.spec.ts expects "${path}" in src/lib/routes.ts and it is not there.`,
    );
  }

  return `${entry.label}${ROUTE_TITLE_SUFFIX}`;
}

/**
 * The two destinations this journey walks, both `navSlot: "inline"` so the
 * journey never has to open the "More" disclosure. v0.25 explicitly does not
 * touch the nav, and a spec that drove the panel would red on v0.24's surface
 * for reasons that have nothing to do with titles.
 */
const DESTINATIONS = [
  { path: "/now", link: "Now", url: "now" },
  { path: "/slicer", link: "Slicer", url: "slicer" },
] as const;

test.describe("v0.25: the browser and the screen reader both learn the room's name", () => {
  test("a client-side navigation renames the tab and announces the destination", async ({
    page,
  }) => {
    // Non-vacuity, before anything is navigated: this journey is only
    // meaningful if the registry it composes expectations from is really
    // populated and the two destinations really are distinct rooms. Without
    // this, an empty or collapsed registry would make every assertion below
    // compare two copies of the same fallback string.
    expect(ROUTES.length, "src/lib/routes.ts exported no routes; the corpus is empty, not clean").toBe(13);
    expect(
      new Set(DESTINATIONS.map((destination) => expectedTitle(destination.path))).size,
      "the two destinations expect the same title, so nothing below could detect a constant title",
    ).toBe(DESTINATIONS.length);

    await page.goto(APP_ROOT);

    // A fresh context is a first-time visitor, so onboarding covers the
    // dashboard; complete it the way J1 and J2 prove works, which also writes
    // the preference record that keeps it closed for the rest of the journey.
    await page.getByRole("button", { name: "Quick start now" }).click();
    await expect(page.getByTestId("onboarding-container")).toHaveCount(0);

    const announcer = page.locator(ANNOUNCER);

    // The announcer must EXIST before anything is asserted about its contents,
    // or an empty locator would fail every clause below with "element not
    // found" and say nothing about announcements. Its two attributes are
    // asserted once, here: they are Next's markup rather than this app's, and
    // they are the entire mechanism by which the text this spec checks reaches
    // a screen reader. If a framework bump drops them, the milestone's claim
    // dies silently and this is the line that says so.
    await expect(
      announcer,
      "no #__next-route-announcer__ inside <next-route-announcer>: Next's route announcer is not mounted, " +
        "so nothing on this page can announce a destination",
    ).toHaveCount(1);
    await expect(announcer).toHaveAttribute("role", "alert");
    await expect(announcer).toHaveAttribute("aria-live", "assertive");

    for (const destination of DESTINATIONS) {
      const titleBefore = await page.title();
      const expected = expectedTitle(destination.path);

      await page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: destination.link, exact: true })
        .click();
      await expect(page).toHaveURL(routeUrl(destination.url));

      // Clause 5, both halves. `toHaveTitle` retries until the navigation has
      // settled, so the second assertion reads a title that is done moving.
      await expect(
        page,
        `${destination.path} does not name itself in the tab`,
      ).toHaveTitle(expected);
      expect(
        await page.title(),
        `the title did not change on the navigation to ${destination.path}: it is still ` +
          `"${titleBefore}", so Next's announcer condition (previousTitle !== currentTitle) ` +
          "is never true and the destination is announced to nobody",
      ).not.toBe(titleBefore);

      // Clause 6. The announcer carries the destination's own name, not the
      // previous room's and not an empty string.
      await expect(
        announcer,
        `the route announcer did not name ${destination.path} after navigating to it`,
      ).toHaveText(expected);
    }

    // Going BACK is a client-side navigation too, and it is the one a person
    // makes most often. The announcer must speak on it as well - the title is
    // moving in the opposite direction, which is a different pass through the
    // same condition.
    await page.goBack();
    await expect(page).toHaveURL(routeUrl(DESTINATIONS[0].url));
    await expect(page).toHaveTitle(expectedTitle(DESTINATIONS[0].path));
    await expect(
      announcer,
      "the route announcer went silent on a browser Back navigation",
    ).toHaveText(expectedTitle(DESTINATIONS[0].path));
  });
});
