import type { Page } from "@playwright/test";

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
 * OBSERVED FAILING (the controls this file ships with)
 * ----------------------------------------------------
 * A gate nobody has seen fail is not a gate. Both were run with the
 * implementation already committed, each perturbation confirmed applied and
 * each red quoted in the PR body.
 *
 *   A - `metadataForRoute()` returns `{}`, so all thirteen segments fall back
 *       to the root default: the exact state the app shipped in before v0.25,
 *       and the "pin every segment title to one constant" control the
 *       done-when list asks for. Rebuilt, all three sampled titles became one
 *       string, and BOTH tests went red - the title one on
 *       `Received: "ADHD Daily Coach: Your friendly self-improvement coach"`,
 *       and the announcer one on `Received: ""` against
 *       `<div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>`.
 *       That empty div is the defect, reproduced on demand.
 *   B - `export const metadata` deleted from `src/app/slicer/layout.tsx` ONLY.
 *       `/now` stayed green and `/slicer` went red in both tests, so the
 *       assertions are per route rather than global - and the announcer red
 *       here is a NON-empty announcer saying the wrong room, which control A
 *       cannot distinguish.
 *
 * And one control that is expected to come back GREEN, run because the
 * done-when list names it as the trap: editing a `label` in `src/lib/routes.ts`
 * moves the expectation and the rendered title TOGETHER. It did
 * (`/now` -> `Right now · ADHD Daily Coach`, three passed). A green there is
 * the failure signal for that control rather than evidence about this spec,
 * which is exactly why the expectations here are composed from the registry
 * and the CONSUMER is what the real controls perturb.
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
 * The registry entry for a path. Throws rather than returning a fallback: a
 * path this cannot resolve means the spec and the registry have parted
 * company, and a plausible-looking default would hide that.
 */
function registryEntry(path: string) {
  const entry = ROUTES.find((route) => route.path === path);

  if (entry === undefined) {
    throw new Error(
      `e2e/route-identity.spec.ts expects "${path}" in src/lib/routes.ts and it is not there.`,
    );
  }

  return entry;
}

/** The string the browser should show for a route, composed from the label the
 *  registry already carries plus the suffix the root template declares. */
function expectedTitle(path: string): string {
  return `${registryEntry(path).label}${ROUTE_TITLE_SUFFIX}`;
}

/**
 * The two destinations this journey walks, both `navSlot: "inline"` so the
 * journey never has to open the "More" disclosure. v0.25 explicitly does not
 * touch the nav, and a spec that drove the panel would red on v0.24's surface
 * for reasons that have nothing to do with titles.
 *
 * Written as PATHS only. The link text and the URL segment are both derived
 * from the registry rather than copied here: a hand-written `"Now"` would be a
 * third spelling of a name the registry already owns, and the moment it drifted
 * this spec would fail with "link not found" - a message about a locator, in a
 * file whose whole subject is names.
 */
const DESTINATION_PATHS = ["/now", "/slicer"] as const;

/**
 * Land on `/` as a first-time visitor and clear the onboarding overlay, which
 * a fresh context always shows on the dashboard. Completing it the way J1 and
 * J2 prove works also writes the preference record that keeps it closed for
 * the rest of the journey.
 */
async function enterAtTheFrontDoor(page: Page): Promise<void> {
  await page.goto(APP_ROOT);
  await page.getByRole("button", { name: "Quick start now" }).click();
  await expect(page.getByTestId("onboarding-container")).toHaveCount(0);
}

/** Click a header nav link, by the label the registry gives that route.
 *  Scoped to the `Primary` landmark so a same-named link elsewhere on the
 *  dashboard cannot stand in for the nav. */
async function clickNavLink(page: Page, path: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: registryEntry(path).label, exact: true })
    .click();
  await expect(page).toHaveURL(routeUrl(path.replace(/^\//, "")));
}

test.describe("v0.25: the browser and the screen reader both learn the room's name", () => {
  /**
   * Non-vacuity, before either journey navigates anywhere: both are only
   * meaningful if the registry they compose expectations from is really
   * populated and the two destinations really are distinct rooms. Without
   * this, an empty or collapsed registry would make every assertion below
   * compare two copies of the same fallback string.
   */
  test("judges a real registry with two distinct destinations", async () => {
    expect(ROUTES.length, "src/lib/routes.ts exported no routes; the corpus is empty, not clean").toBe(13);
    expect(
      new Set(DESTINATION_PATHS.map((path) => expectedTitle(path))).size,
      "the two destinations expect the same title, so nothing below could detect a constant title",
    ).toBe(DESTINATION_PATHS.length);
  });

  /**
   * Clause 5, kept in its own test rather than folded into the announcer one.
   * The two clauses fail TOGETHER under the perturbation that matters (one
   * constant title breaks both), and a single test would stop at whichever
   * assertion came first - reporting the title and saying nothing about the
   * announcement, which is the half no other test in this repo can see.
   */
  test("a client-side navigation renames the tab, and the name actually changes", async ({
    page,
  }) => {
    await enterAtTheFrontDoor(page);

    for (const path of DESTINATION_PATHS) {
      const titleBefore = await page.title();
      const expected = expectedTitle(path);

      await clickNavLink(page, path);

      // `toHaveTitle` retries until the navigation has settled, so the
      // assertion after it reads a title that is done moving - the "after the
      // navigation settles rather than on a timer" half of the clause.
      await expect(page, `${path} does not name itself in the tab`).toHaveTitle(expected);
      expect(
        await page.title(),
        `the title did not change on the navigation to ${path}: it is still ` +
          `"${titleBefore}", so Next's announcer condition (previousTitle !== currentTitle) ` +
          "is never true and the destination is announced to nobody",
      ).not.toBe(titleBefore);
    }
  });

  /** Clause 6 - the only assertion in this repo that observes the
   *  announcement itself rather than its precondition. */
  test("the route announcer names the destination, including on Back", async ({ page }) => {
    await enterAtTheFrontDoor(page);

    const announcer = page.locator(ANNOUNCER);

    // The announcer must EXIST before anything is asserted about its contents,
    // or an empty locator would fail every clause below with "element not
    // found" and say nothing about announcements. Its two attributes are
    // asserted here rather than assumed: they are Next's markup rather than
    // this app's, and they are the entire mechanism by which the text this
    // spec checks reaches a screen reader. If a framework bump drops them, the
    // milestone's claim dies silently and this is the line that says so.
    await expect(
      announcer,
      "no #__next-route-announcer__ inside <next-route-announcer>: Next's route announcer is not mounted, " +
        "so nothing on this page can announce a destination",
    ).toHaveCount(1);
    await expect(announcer).toHaveAttribute("role", "alert");
    await expect(announcer).toHaveAttribute("aria-live", "assertive");

    for (const path of DESTINATION_PATHS) {
      await clickNavLink(page, path);

      // The announcer carries the destination's own name - not the previous
      // room's, and not an empty string, which is what it held on every
      // navigation until this milestone.
      await expect(
        announcer,
        `the route announcer did not name ${path} after navigating to it`,
      ).toHaveText(expectedTitle(path));
    }

    // Going BACK is a client-side navigation too, and it is the one a person
    // makes most often. The announcer must speak on it as well - the title is
    // moving in the opposite direction, which is a different pass through the
    // same condition.
    const first = DESTINATION_PATHS[0];
    await page.goBack();
    await expect(page).toHaveURL(routeUrl(first.replace(/^\//, "")));
    await expect(
      announcer,
      "the route announcer went silent on a browser Back navigation",
    ).toHaveText(expectedTitle(first));
  });
});
