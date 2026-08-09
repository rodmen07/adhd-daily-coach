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
   * The measured achievable height with headroom for font-metric noise across
   * chromium versions. Deliberately NOT set to the achievable figure itself -
   * a ceiling with no slack turns a chromium bump into a red that says nothing
   * about this app.
   *
   * RATCHETED BY v0.26 PR1 (docs/design/HEADER_ACTIONS.md D5, done-when 2),
   * from 150 / 150 / 100 to 133 / 133 / 60: PR1 measured 121.9 px on the phone
   * widths (was 137.9) and 55.2 px at 1280 (was 67.0). RATCHETED AGAIN BY
   * v0.26 PR2 (D5, done-when 5), phones 133 -> 104: with the cluster on the
   * title row the phone header measures 95.2 px at all three widths, and
   * 95.2 x 1.09 = 104. The 1280 ceiling stays 60, because the desktop header
   * was already one row before PR2 and PR2 must not change it - a regression
   * of the min-width rule that keeps desktop on one line would jump the shell
   * to ~95 px and fail that ceiling. The rule is the one v0.23 set: the
   * measured figure plus ~9%. A gate left at the old numbers would have stayed
   * green through the entire milestone and stopped describing the shape it
   * guards.
   */
  readonly headerCeiling: number;
  /** What this viewport measured before each ratchet, quoted in the failure
   * message so a red names how bad it has been rather than only how bad it is. */
  readonly measuredBefore: string;
};

const VIEWPORTS: readonly NavViewport[] = [
  {
    label: "375x667 (iPhone SE class)",
    width: 375,
    height: 667,
    headerCeiling: 104,
    measuredBefore: "264 px before v0.23, 121.9 px before v0.26 PR2",
  },
  {
    label: "412x823 (the Lighthouse mobile default)",
    width: 412,
    height: 823,
    headerCeiling: 104,
    measuredBefore: "222 px before v0.23, 121.9 px before v0.26 PR2",
  },
  {
    // Joined the table at v0.26 PR2: 360 is section 1c's binding width, where
    // the room beside the title is smallest, so the two-row clauses below are
    // asserted here too and this row gives them the ceiling and scroll clauses
    // for free. It was never measured before v0.23, hence the shorter history.
    label: "360x740 (the binding width from HEADER_ACTIONS.md 1c)",
    width: 360,
    height: 740,
    headerCeiling: 104,
    measuredBefore: "121.9 px before v0.26 PR2",
  },
  {
    label: "1280x720 (the e2e project's Desktop Chrome)",
    width: 1280,
    height: 720,
    headerCeiling: 60,
    measuredBefore: "180 px before v0.23, 67.0 px before v0.26 PR1",
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
          `reading area from every route (it measured ${viewport.measuredBefore})`,
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
 * v0.26 PR1 - the controls get compact (docs/design/HEADER_ACTIONS.md D3, D4,
 * D5; roadmap done-when 1, 2 and the browser half of 8).
 *
 * This lives beside the v0.23 ceilings rather than in a spec of its own (D7):
 * a second file measuring the same shell would create two places that must
 * agree about the same numbers.
 *
 * WHY THE CLUSTER AND NOT JUST THE SHELL. The shell ceilings above already
 * fell to 133 / 60, but a shell height is satisfiable by many shapes - a
 * smaller font, a tighter padding, a control that wrapped somewhere invisible.
 * These clauses name the thing the milestone actually changed: the cluster's
 * own box, and the individual control that was setting it. 360x740 is the
 * binding width from section 1c, and the width clause is asserted HERE, in
 * PR1, precisely so PR2 cannot discover late that the cluster still does not
 * fit beside the title.
 *
 * RE-POINTED BY v0.26 PR2: this was `.site-nav-actions > :last-child`, a
 * positional address that PR #172 filed as an obligation on the PR that moves
 * the node - PR2 removed `.site-nav-actions` entirely and gave the cluster the
 * `.site-nav-cluster` class hook in layout.tsx in the same commit. The
 * CLUSTER_CONTROLS count below is unchanged and still runs before any
 * measurement, so a restructure that leaves this selector naming the wrong
 * node (or none) fails on the count rather than measuring the wrong box.
 */
const CLUSTER = ".site-nav-cluster";

/** Sync badge, keyboard help, theme toggle - the three the design doc measured. */
const CLUSTER_CONTROLS = 3;

test.describe("v0.26 PR1: the header's controls are compact", () => {
  test("the cluster and the theme control are both under 36 px at 360x740, and the cluster fits the title row's 190 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openDashboard(page);

    const cluster = page.locator(CLUSTER);
    await expect(cluster).toHaveCount(1);

    // Vacuity control, and the selector's own self-check in one. `:last-child`
    // is how section 1b addressed this node; if the header ever restructures so
    // that it names something else, this count is what says so instead of the
    // measurements below quietly describing the wrong box.
    const controls = page.locator(`${CLUSTER} > *`);
    expect(
      await controls.count(),
      ".site-nav-cluster does not hold the three controls the " +
        "measurements below describe, so this spec is measuring the wrong node",
    ).toBe(CLUSTER_CONTROLS);

    const clusterBox = await cluster.boundingBox();
    expect(clusterBox, "the actions cluster has no layout box at all").not.toBeNull();

    // Clause 1a: it was 46.0 px, and 54.0 px of the 137.9 px header once the
    // gap it forces is counted - 39.2% of the header for three controls.
    expect(
      Math.round(clusterBox!.height),
      "the sync/help/theme cluster is taller than 36 px again, so it is back to " +
        "being the tallest thing in the app's chrome (it measured 46.0 px before " +
        "v0.26 PR1, and 30.0 px after)",
    ).toBeLessThanOrEqual(36);

    // Clause 1b: the width PR2 needs. 360 is the binding width - beside a
    // 131.8 px title and a 10 px gap there is 186.2 px of room, and this
    // ceiling is that figure rounded up with the same slack rule.
    expect(
      Math.round(clusterBox!.width),
      "the cluster is wider than 190 px at the binding 360 px width, so it will " +
        "not fit beside the title and v0.26 PR2's two-row header is blocked (it " +
        "measured 327.1 px before PR1, and 112.0 px after)",
    ).toBeLessThanOrEqual(190);

    // Clause 1c: the individual control that was setting the row's height.
    // Asserted separately because a cluster that fits while one child is
    // enormous means the others merely shrank around it.
    const themeBox = await page.locator(".theme-toggle").boundingBox();
    expect(themeBox, "the theme toggle has no layout box at all").not.toBeNull();
    expect(
      Math.round(themeBox!.height),
      "the theme toggle is taller than 36 px, which is the single control that " +
        "made the header 46 px tall before v0.26 PR1 (it measured 143.6 x 46.0, " +
        "and 30.0 x 30.0 after)",
    ).toBeLessThanOrEqual(36);
  });

  /**
   * D4, and the browser half of done-when 8. The jsdom suite
   * (`src/app/components/__tests__/sync-status-badge.test.tsx`) proves the
   * accessible name does not depend on the viewport by construction; only a
   * real browser can prove the COLLAPSE happens at all, because it is a media
   * query and jsdom has no CSS.
   *
   * The two halves are asserted together on purpose: "the word is hidden at
   * 360" alone is satisfied by deleting the word, and "the word is visible at
   * 1280" alone is satisfied by never collapsing.
   */
  test("the sync word is hidden below the 56rem cap and back above it, with one accessible name at both", async ({
    page,
  }) => {
    const word = page.locator(".sync-status-word");
    const badge = page.locator(`${CLUSTER} > :first-child`);

    await page.setViewportSize({ width: 360, height: 740 });
    await openDashboard(page);

    await expect(word).toHaveCount(1);
    expect(
      (await word.textContent())?.trim(),
      "the collapsed badge has no word in the DOM at all: it was removed rather " +
        "than hidden, which takes the state out of the page instead of off the screen",
    ).toBeTruthy();

    const narrowWord = await word.boundingBox();
    expect(
      Math.round(narrowWord?.width ?? 0),
      "the sync word still paints below the 56rem cap, so the badge did not " +
        "collapse to its dot and the cluster's width clause above is being met " +
        "some other way",
    ).toBeLessThanOrEqual(2);

    const narrowName = await badge.getAttribute("aria-label");
    expect(narrowName, "the collapsed badge has no accessible name").toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 720 });
    // The media query is the only thing that changed; no navigation, so this
    // is the same DOM re-laid out, which is exactly the claim being tested.
    await expect(word).toBeVisible();
    const wideWord = await word.boundingBox();
    expect(
      Math.round(wideWord?.width ?? 0),
      "the sync word never comes back above the 56rem cap, so the desktop badge " +
        "is a bare dot and D4's 'keeps its word on desktop' is not what shipped",
    ).toBeGreaterThan(40);

    expect(
      await badge.getAttribute("aria-label"),
      "the badge announces itself differently at 1280 than at 360, so what a " +
        "screen reader is told about where the data lives depends on the window width",
    ).toBe(narrowName);
  });
});

/**
 * v0.26 PR2 - the row goes away (docs/design/HEADER_ACTIONS.md D1, D5;
 * roadmap done-when 5, 6 and 7).
 *
 * The cluster left `.site-nav-actions` and sits beside the title, so below the
 * 56rem cap the header is exactly two rows: title + cluster, then the nav. The
 * shell ceiling above (104, was 133) is the pixel half of that claim; these
 * clauses are the structural half a font shrink cannot fake.
 *
 * WHY CENTERS AND NOT TOPS. Done-when 6 says the title and the cluster "share
 * one top coordinate", and on a centered flex line they structurally cannot:
 * `.site-nav-inner` aligns items center, so an 18.7 px title next to a 30 px
 * cluster sits 5.6 px lower by construction (measured: title top 15.6, cluster
 * top 10, on the same row). The coordinate two different-height siblings share
 * when they occupy one row is the vertical CENTER (both 25.0 here), so that is
 * what is asserted - the clause's intent (two rows, as coordinates rather than
 * as a pixel count) unchanged, the coordinate corrected. The nav children keep
 * their literal shared-top assertion in the v0.23 block above: they are
 * same-height pills, where tops and centers agree.
 *
 * Runs at every viewport below the cap - the widths where the two-row shape
 * exists. Above it the desktop stays one row, which the 60 px ceiling above
 * already pins (a two-row desktop would measure ~95 px).
 */
const NAV_CAP_PX = 56 * 16; // 56rem at the 16px root font e2e runs with.
const PHONE_VIEWPORTS = VIEWPORTS.filter((viewport) => viewport.width < NAV_CAP_PX);

test.describe("v0.26 PR2: the header is two rows below the cap", () => {
  for (const viewport of PHONE_VIEWPORTS) {
    test(`the cluster sits on the title's row at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDashboard(page);

      // Same vacuity control as the PR1 clauses: never measure a node that is
      // not the three-control cluster.
      await expect(page.locator(CLUSTER)).toHaveCount(1);
      expect(await page.locator(`${CLUSTER} > *`).count()).toBe(CLUSTER_CONTROLS);

      const [titleCenter, clusterCenter] = await page.evaluate(() => {
        const centerOf = (selector: string) => {
          const rect = document.querySelector(selector)!.getBoundingClientRect();
          return Math.round(rect.top + rect.height / 2);
        };
        return [centerOf(".site-nav-title"), centerOf(".site-nav-cluster")];
      });

      expect(
        Math.abs(titleCenter - clusterCenter),
        `the cluster does not share the title's row at ${viewport.label}: its ` +
          `vertical center sits ${Math.abs(titleCenter - clusterCenter)} px from ` +
          "the title's, so the three controls are back on a row of their own - " +
          "the third row v0.26 PR2 removed",
      ).toBeLessThanOrEqual(1);
    });

    test(`the header is exactly two rows at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openDashboard(page);

      await expect(page.locator(CLUSTER)).toHaveCount(1);
      const navChildren = page.locator(".site-nav-links > *");
      expect(await navChildren.count()).toBeGreaterThanOrEqual(MIN_NAV_CHILDREN);

      // Every header occupant's row, as coordinates: the title, the cluster,
      // and each nav child. Group centers closer than 4 px into one row (the
      // rounding slack two same-row siblings can accumulate); distinct rows
      // are farther apart than that by an order of magnitude (25 vs 67 here).
      const rowCenters = await page.evaluate(() => {
        const centers: number[] = [];
        for (const el of document.querySelectorAll(
          ".site-nav-title, .site-nav-cluster, .site-nav-links > *",
        )) {
          const rect = el.getBoundingClientRect();
          centers.push(Math.round(rect.top + rect.height / 2));
        }
        centers.sort((a, b) => a - b);
        const rows: number[] = [];
        for (const center of centers) {
          if (rows.length === 0 || center - rows[rows.length - 1] > 4) {
            rows.push(center);
          }
        }
        return rows;
      });

      expect(
        rowCenters,
        `the header renders ${rowCenters.length} distinct rows at ` +
          `${viewport.label} (row centers at ${rowCenters.join(", ")} px), not ` +
          "the two v0.26 PR2 ships: title + cluster, then the nav",
      ).toHaveLength(2);
    });
  }
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
