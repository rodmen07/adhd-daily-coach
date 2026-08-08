import { test, expect, APP_ROOT } from "./fixtures";

/**
 * v0.23 PR2 - the header fits (docs/design/NAV_SHAPE.md D7, done-when 4 and 5),
 * extended by v0.24 PR2 with the dismissal clause (docs/design/NAV_TAXONOMY.md
 * D7, done-when 6). The pixel, one-row and no-sideways-scroll ceilings below
 * are unchanged by the grouping v0.24 PR1 added to the panel: a grouped panel
 * must not grow the CLOSED header, and this file is what says so.
 *
 * WHY THIS IS A BROWSER TEST AND NOT A UNIT TEST
 * ----------------------------------------------
 * The defect this milestone exists to fix is a MEASUREMENT: a sticky header
 * that ate 264 px of a 375x667 viewport - 39.6% of the screen, permanently,
 * on every route - because twelve nav pills cannot fit in the 56rem
 * `.site-nav-inner` cap at any width. Nothing in jsdom can see that. There is
 * no layout engine there, `getBoundingClientRect()` returns zeroes, and a
 * component test asserting "the nav renders three links" would stay green if
 * the CSS regressed the wrap back to four rows tomorrow.
 *
 * So the assertion runs where a reader's browser runs it: chromium, against
 * the real static export served the way GitHub Pages serves it.
 *
 * WHY THREE CLAUSES AND NOT A PIXEL CEILING
 * -----------------------------------------
 * D7's reasoning, kept here because it is what makes the test hard to fake:
 *
 *   - A pixel ceiling ALONE is satisfied by shrinking the font. So every
 *     viewport also asserts that all `.site-nav-links` children share one
 *     `top` coordinate - genuinely one row, not smaller pills on two.
 *   - A row count ALONE is satisfied by the horizontally scrolling row D2
 *     explicitly rejected. So every viewport also asserts that the document
 *     never scrolls sideways.
 *
 * Either clause on its own is a gate with a hole in it; the three together
 * pin the shape the design doc actually chose.
 *
 * OBSERVED FAILING (the negative control this file ships with)
 * -----------------------------------------------------------
 * Run against `main` at `40f8d8e`, before the collapse, this spec reported the
 * header at 264 / 222 / 180 px against ceilings of 150 / 150 / 100, and the
 * four-row nav at 375x667 as four distinct `top` coordinates. The exact output
 * is quoted in the PR body. A gate nobody has seen fail is not a gate.
 *
 * The console-error tripwire from ./fixtures is armed automatically.
 */

type NavViewport = {
  /** Human name, used in the test title so a CI failure names the device. */
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /**
   * D7's ceiling: the measured achievable height (138 / 138 / 67) with
   * headroom for font-metric noise across chromium versions. Deliberately NOT
   * set to the achievable figure itself - a ceiling with no slack turns a
   * chromium bump into a red that says nothing about this app.
   */
  readonly headerCeiling: number;
  /** What `main` measured before the collapse, quoted in the failure message. */
  readonly measuredBefore: number;
};

const VIEWPORTS: readonly NavViewport[] = [
  {
    label: "375x667 (iPhone SE class)",
    width: 375,
    height: 667,
    headerCeiling: 150,
    measuredBefore: 264,
  },
  {
    label: "412x823 (the Lighthouse mobile default)",
    width: 412,
    height: 823,
    headerCeiling: 150,
    measuredBefore: 222,
  },
  {
    label: "1280x720 (the e2e project's Desktop Chrome)",
    width: 1280,
    height: 720,
    headerCeiling: 100,
    measuredBefore: 180,
  },
];

/**
 * The floor below which the row assertions mean nothing.
 *
 * Three inline links plus the More disclosure is four children. If the nav
 * ever rendered one child - or none, which is what a broken derivation looks
 * like - "every child shares one top" would be trivially true and the ceiling
 * would be trivially met, and this spec would report a beautifully compact
 * header that nobody can navigate. The vacuity control is the reason the
 * count is asserted before anything is measured.
 */
const MIN_NAV_CHILDREN = 4;

/** Land on the dashboard as a settled visitor, with the first-run overlay gone. */
async function openDashboard(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(APP_ROOT);
  // A fresh Playwright context is a genuine first-time visitor, so onboarding
  // appears after hydration (J1 pins that behaviour). Complete it the way J2
  // does: an overlay is its own layout, and measuring the header underneath
  // one would measure a state a returning reader never sees.
  await page.getByRole("button", { name: "Quick start now" }).click();
  await expect(page.getByTestId("onboarding-container")).toHaveCount(0);
}

test.describe("v0.23: the header fits", () => {
  for (const viewport of VIEWPORTS) {
    test(`one row, under ${viewport.headerCeiling} px, no sideways scroll at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDashboard(page);

      const shell = page.locator(".site-nav-shell");
      await expect(shell).toBeVisible();

      // Vacuity control first: measure nothing until the nav really rendered.
      const navChildren = page.locator(".site-nav-links > *");
      expect(
        await navChildren.count(),
        "the primary nav rendered fewer than the three inline links plus the More " +
          "disclosure, so every measurement below would describe an empty header",
      ).toBeGreaterThanOrEqual(MIN_NAV_CHILDREN);

      // Clause 1: the sticky header's real height.
      const box = await shell.boundingBox();
      expect(box, "the header has no layout box at all").not.toBeNull();
      expect(
        Math.round(box!.height),
        `the sticky header is taller than ${viewport.headerCeiling} px at ` +
          `${viewport.label}, so it is back to subtracting a large share of the ` +
          `reading area from every route (it measured ${viewport.measuredBefore} px ` +
          "before v0.23 collapsed it)",
      ).toBeLessThanOrEqual(viewport.headerCeiling);

      // Clause 2: one row, not smaller pills on several.
      const tops = await navChildren.evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
      );
      expect(
        [...new Set(tops)],
        `the nav wrapped: its children sit at ${new Set(tops).size} distinct top ` +
          "coordinates, so the header is more than one row again even if it fits " +
          "the pixel ceiling by using a smaller font",
      ).toHaveLength(1);

      // Clause 3: no horizontal scrolling, which is the other way to fake
      // clause 2 (the all-twelve scrolling row D2 rejected).
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(
        scrollWidth,
        "the document scrolls sideways, which is how a single row of twelve pills " +
          "would satisfy the row assertion while hiding most of the nav off-screen",
      ).toBeLessThanOrEqual(viewport.width);
    });
  }

  test("the More disclosure is reachable and operable by keyboard alone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openDashboard(page);

    const disclosure = page.locator(".site-nav-more");
    await expect(disclosure).toHaveCount(1);
    // Closed is the shape every measurement above was taken in.
    await expect(disclosure).not.toHaveAttribute("open", /.*/);

    // Tab from the top of the document. Nothing here clicks: the whole point
    // of D4's native <details> over a custom popover is that the platform
    // makes it operable, and a mouse-driven assertion would not notice if it
    // stopped being.
    const reachedInTabs = await tabUntil(page, ".site-nav-more > summary");
    expect(
      reachedInTabs,
      "the More disclosure is not reachable by Tab within 40 stops, so nine of the " +
        "twelve routes have no keyboard path through the header at all",
    ).toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("open", /.*/);

    // Every link inside enters the tab order once open, and tabbing out of the
    // summary walks exactly them in DOM order. Since v0.24 that DOM order is
    // by category (registry order within each), which this assertion is
    // indifferent to: both sides are read from the live DOM, so it proves the
    // tab order follows what is rendered rather than what a list says.
    const panelHrefs = await page
      .locator(".site-nav-more-panel a")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(
      panelHrefs.length,
      "the More panel holds fewer than the nine routes that are not inline, so the " +
        "tab-order assertion below would prove nothing",
    ).toBeGreaterThanOrEqual(9);

    const focusedHrefs: (string | null)[] = [];
    for (let index = 0; index < panelHrefs.length; index += 1) {
      await page.keyboard.press("Tab");
      focusedHrefs.push(
        await page.evaluate(
          () => (document.activeElement as HTMLElement | null)?.getAttribute("href") ?? null,
        ),
      );
    }

    expect(
      focusedHrefs,
      "tabbing out of the open More summary did not walk its links in order: a link " +
        "inside the disclosure is out of the tab order, or focus escaped the header",
    ).toEqual(panelHrefs);
  });

  /**
   * v0.24 D7, done-when clause 6.
   *
   * The unit guard in `src/app/__tests__/route-registry-guard.test.ts` asserts
   * the same dismissal in jsdom, and this is not a duplicate of it. jsdom has
   * no layout, no native `<details>` activation behaviour and no real focus
   * model: there, the disclosure is opened by assigning `open` and Escape is
   * dispatched at `document`, so passing is a statement about the handler.
   * Here the menu is opened the way a reader opens it - Tab to the summary,
   * press Enter - and Escape is a real key on a real focused element, so
   * passing is a statement about the menu.
   */
  test("Escape closes the More disclosure and returns focus to its summary", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openDashboard(page);

    const disclosure = page.locator(".site-nav-more");
    await expect(disclosure).toHaveCount(1);
    await expect(disclosure).not.toHaveAttribute("open", /.*/);

    const reachedInTabs = await tabUntil(page, ".site-nav-more > summary");
    expect(
      reachedInTabs,
      "the More disclosure is not reachable by Tab within 40 stops, so this test " +
        "never opened the menu it claims to dismiss",
    ).toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("open", /.*/);

    // Escape from INSIDE the panel, which is where a keyboard reader who wants
    // to dismiss it actually is. Pressing it while focus is still on the
    // summary would leave the focus-return assertion below trivially true.
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.closest(".site-nav-more-panel") !== null),
      "tabbing once out of the open summary did not land inside the panel, so the " +
        "focus-return assertion below would prove nothing about focus moving",
    ).toBe(true);

    await page.keyboard.press("Escape");

    await expect(disclosure).not.toHaveAttribute("open", /.*/);
    expect(
      await page.evaluate(
        () =>
          document.activeElement instanceof Element &&
          document.activeElement.matches(".site-nav-more > summary"),
      ),
      "Escape closed the disclosure but left focus on a link inside the panel it " +
        "just hid, which is worse for a keyboard reader than not closing at all",
    ).toBe(true);
  });
});

/**
 * Press Tab until the focused element matches `selector`; return the number of
 * presses, or -1 if it never did.
 *
 * Bounded so a regression that removes the summary from the tab order fails
 * the test rather than hanging the job until the 15-minute workflow timeout.
 */
async function tabUntil(
  page: import("@playwright/test").Page,
  selector: string,
  limit = 40,
): Promise<number> {
  for (let press = 1; press <= limit; press += 1) {
    await page.keyboard.press("Tab");
    const matched = await page.evaluate((target) => {
      const active = document.activeElement;
      return active instanceof Element && active.matches(target);
    }, selector);

    if (matched) {
      return press;
    }
  }

  return -1;
}
