/**
 * Drift guard for the header's 56rem cap (v0.26 PR2, closing the PR #172
 * backlog item "the 56rem collapse breakpoint is written in TWO files that
 * must agree, and nothing checks that they do" - by PR2 it was THREE
 * declarations, all in globals.css).
 *
 * Source A: `.site-nav-inner`'s `max-width` - the room the header actually
 *   has, and the reason everything else picks 56rem.
 * Sources B: every rem-valued width media query in the stylesheet - the
 *   sync-word collapse (`max-width: 56rem`, v0.26 PR1) and the desktop
 *   one-row rule (`min-width: 56rem`, v0.26 PR2).
 *
 * They are the same number for a reason: the header changes shape exactly
 * where it stops being able to hold everything on one line. But they are
 * independent literals, so editing the cap alone would leave the sync word
 * hiding at a width where there is now room for it (or the desktop one-row
 * rule firing where the row no longer fits), and every other gate stays
 * green: the e2e clauses measure at 360 and 1280, both far from the
 * boundary, so a breakpoint that drifted to 48rem or 64rem is invisible to
 * them. A media query cannot read a custom property, which is why this is a
 * guard test and not a `--nav-cap` variable.
 *
 * THE CONTRACT THIS ENFORCES: a rem-valued width media query in globals.css
 * IS a nav-cap boundary. An unrelated breakpoint must use px (the existing
 * 640px query does), which is what keeps this scan's corpus principled
 * rather than a hand list.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const STYLESHEET_PATH = path.join(process.cwd(), "src/app/globals.css");

/** CRLF-normalised: this repo checks out with CRLF on Windows and LF on the
 * Linux runner, and every regex here must see the same text. */
const stylesheet = readFileSync(STYLESHEET_PATH, "utf-8").replace(/\r\n/g, "\n");

/** The `.site-nav-inner` cap, e.g. "56". Throws rather than returning a
 * default: a guard that cannot find its source must fail loudly, not compare
 * undefined against undefined and pass (the vacuity failure L-033 names). */
function readInnerCapRem(css: string): string {
  const block = /\.site-nav-inner\s*\{([^}]*)\}/.exec(css);
  if (!block) {
    throw new Error(
      "globals.css no longer contains a `.site-nav-inner` block; if the header's " +
        "inner wrapper was renamed, update this guard in the same commit",
    );
  }

  const cap = /max-width:\s*([\d.]+)rem/.exec(block[1]);
  if (!cap) {
    throw new Error(
      "`.site-nav-inner` no longer declares a rem-valued max-width; the nav cap " +
        "this guard holds the media queries to does not exist any more",
    );
  }

  return cap[1];
}

/** Every rem-valued width media-query boundary, e.g. ["56", "56"], with the
 * feature kept so a failure names the exact query. */
function readRemWidthQueries(css: string): { feature: string; rem: string }[] {
  return [...css.matchAll(/@media[^{]*\(((?:min|max)-width):\s*([\d.]+)rem\)/g)].map((match) => ({
    feature: match[1],
    rem: match[2],
  }));
}

describe("the header's 56rem cap has one value everywhere it is written", () => {
  const cap = readInnerCapRem(stylesheet);
  const queries = readRemWidthQueries(stylesheet);

  it("still finds both boundary media queries (negative control for the scan)", () => {
    // Two are shipped: the sync-word collapse (max-width) and the desktop
    // one-row rule (min-width). A scan that stops seeing one of them would
    // otherwise "agree" on whatever is left - deleting a boundary rule is a
    // decision this guard makes loud rather than silent.
    const features = queries.map((query) => query.feature).sort();
    expect(
      features,
      "globals.css no longer carries both nav-cap boundary media queries (the " +
        "max-width sync-word collapse and the min-width desktop one-row rule); " +
        "if one was deliberately removed, update this guard in the same commit",
    ).toEqual(["max-width", "min-width"]);
  });

  it("keeps every rem-valued width media query equal to the .site-nav-inner cap", () => {
    for (const query of queries) {
      expect(
        `${query.feature}: ${query.rem}rem`,
        `the \`@media (${query.feature}: ${query.rem}rem)\` boundary drifted from ` +
          `.site-nav-inner's max-width: ${cap}rem - the header would change shape ` +
          "at a width where its room did not change",
      ).toBe(`${query.feature}: ${cap}rem`);
    }
  });
});
