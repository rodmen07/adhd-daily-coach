/**
 * A theme token must reach the browser, not just the class attribute.
 *
 * Source A: the shipped `src/` tree, glob-discovered via `shippedSourceFiles`,
 *   comments stripped - every className this app actually renders.
 * Source B: the CSS parser itself, exercised through `CSSStyleDeclaration`,
 *   which accepts or rejects the two declaration shapes Tailwind emits for the
 *   two ways of spelling a CSS-variable utility.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Tailwind v3 let a CSS variable be spelled with square brackets - a colour
 * utility, a hyphen, then `[--field]`. Tailwind v4 changed that to
 * `bg-(--field)`, and this repo is on v4 (`tailwindcss: ^4`). The old spelling
 * does not error and does not disappear: v4 compiles it, literally, to a rule
 * whose single declaration is
 *
 *     background-color: --field
 *
 * (This file spells the broken form as `[--field]` with the utility prefix held
 * separately, on purpose. Tailwind scans test files too, and writing a complete
 * candidate here would make the compiler emit one more of exactly the dead
 * rules this guard exists to remove.)
 *
 * `--field` there is a dashed-ident - the NAME of a custom property - where a
 * `<color>` is required. The declaration is invalid, so a conforming parser
 * drops it and the element is painted by nothing. `border-color` is the worst
 * case: its initial value is `currentColor`, so a dropped `border-(--line)`
 * does not merely lose the subtle line colour, it repaints the border in the
 * text colour.
 *
 * 258 occurrences had shipped across 12 files. The visible cost was not
 * cosmetic. On `/ambient` the sound cards distinguish the playing sound from
 * the rest ENTIRELY through these classes -
 * `border-(--accent) bg-(--accent)/10 text-(--foreground)` when selected
 * against `border-(--line) bg-(--field) text-(--muted)` when not - so with
 * every one of those six declarations dropped, the selected card and the
 * unselected cards rendered identically and the selection had no visual
 * affordance at all. `subscription-guard.tsx`'s "Subscribe for $5/month"
 * button, the only call to action on the paywall, lost its background and its
 * foreground the same way.
 *
 * WHY A GUARD AND NOT A NOTE
 * --------------------------
 * The rule was already written down. `agents/dev-agent/PROJECT_MEMORY.md:11`
 * has said "the bg-[--var] form compiles to invalid CSS and renders nothing"
 * since before any of this shipped. It was recorded and ungated, and 258
 * occurrences accumulated anyway - including inside
 * `docs/design/THEME_CONSISTENCY.md`, the design document that PRESCRIBED the
 * broken form as the fix for a different invisible-rendering bug. Prose is not
 * a gate.
 *
 * WHAT IS DELIBERATELY NOT SCANNED, AND WHY
 * -----------------------------------------
 * 1. Comments. `withoutComments` runs first, so this file's own doc may spell
 *    the broken form (it does, above) without tripping itself.
 * 2. Markdown, and `agents/dev-agent/**`. A document has to be able to name the
 *    wrong form in order to teach it - which is exactly what the dev-agent
 *    memory line and the correction note in `THEME_CONSISTENCY.md` do. Tailwind
 *    does scan those files and does emit a dead rule for each mention, but a
 *    rule attached to no element costs bytes, not pixels, and guarding prose
 *    would forbid writing the rule down. The rendering surface is `src/`.
 *
 * THE FALSIFIER IS THE SECOND DESCRIBE BLOCK
 * ------------------------------------------
 * A ban on a string is arbitrary unless the string is provably harmful, so the
 * mechanism is asserted here rather than asserted about. If some future
 * browser, spec change, or Tailwind release makes `background-color: --field`
 * meaningful, "the CSS parser tells the two forms apart" fails FIRST and this
 * whole guard becomes retirable - deliberately, with a red test naming the
 * reason, instead of quietly enforcing a rule that stopped being true.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { shippedSourceFiles, withoutComments } from "@/__tests__/helpers/source-scan";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

/**
 * Built from parts rather than written out, so the pattern this guard forbids
 * never appears literally in the file that forbids it. A guard that has to
 * exempt itself has an exemption mechanism, and an exemption mechanism is how
 * guards rot.
 */
const OPEN = "\\[";
const CLOSE = "\\]";
const TOKEN = "--[a-zA-Z0-9-]+";
const V3_SHORTHAND = new RegExp(`[a-zA-Z-]+-${OPEN}(${TOKEN})${CLOSE}`, "g");

/** The working spellings, for the presence sentinel below. */
const V4_SHORTHAND = new RegExp(`[a-zA-Z-]+-\\((?:color:)?${TOKEN}\\)`, "g");

interface Offender {
  file: string;
  line: number;
  text: string;
}

function scan(): { files: string[]; offenders: Offender[]; workingUses: number } {
  const files = shippedSourceFiles(SRC_DIR);
  const offenders: Offender[] = [];
  let workingUses = 0;

  for (const absolute of files) {
    const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
    const source = withoutComments(readFileSync(absolute, "utf-8").replace(/\r\n/g, "\n"));

    workingUses += source.match(V4_SHORTHAND)?.length ?? 0;

    source.split("\n").forEach((text, index) => {
      for (const match of text.matchAll(V3_SHORTHAND)) {
        offenders.push({ file: relative, line: index + 1, text: match[0] });
      }
    });
  }

  return { files, offenders, workingUses };
}

describe("theme-token utilities are spelled the way Tailwind v4 compiles", () => {
  const { files, offenders, workingUses } = scan();

  it("scans a real corpus (zero-match hard failure)", () => {
    // A guard whose file walk silently returned nothing would report a clean
    // repo forever, which is the failure mode this repo has shipped before.
    expect(
      files.length,
      "shippedSourceFiles() returned no files under src/; the scan is blind, not clean"
    ).toBeGreaterThan(40);

    // Presence sentinel, asserted as a TOKEN rather than as an owning file, so
    // renaming or moving any single component cannot turn it into a no-op:
    // the corpus must actually contain the spelling this guard demands, or the
    // guard is passing over content it cannot read.
    expect(
      workingUses,
      "no file under src/ uses the X-(--token) form at all, so either the scan " +
        "cannot see className strings or the theme tokens have been removed"
    ).toBeGreaterThan(100);
  });

  it("contains no Tailwind v3 CSS-variable shorthand", () => {
    const detail = offenders
      .slice(0, 20)
      .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
      .join("\n");

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `${offenders.length} Tailwind v3 CSS-variable utilities found under src/. ` +
          "Under Tailwind v4 each compiles to a bare dashed-ident declaration " +
          "(e.g. `background-color: --field`), which is invalid CSS and is dropped, " +
          "so the element renders unstyled. Use the parenthesis form instead " +
          "(`bg-(--field)`), or `bg-(color:--field)` for shadow and ring colours:\n" +
          detail
    ).toEqual([]);
  });
});

describe("the CSS parser tells the two forms apart (the falsifier)", () => {
  /**
   * The properties the built stylesheet at `3a40792` was observed emitting for
   * these utilities WERE `background-color` (8 declarations), `color` (8),
   * `border-color` (4), `accent-color` (1), `--tw-ring-color` (1) and
   * `--tw-shadow` (1). Only the first three are listed here, and the reason is
   * worth stating rather than hiding: jsdom implements value parsing per
   * property, and it does NOT validate `accent-color` - asserting it here
   * failed with `expected '--accent' to be ''`, which is a fact about jsdom,
   * not about CSS. The two `--tw-*` entries are custom properties, which by
   * definition accept any token sequence; their damage happens one level later,
   * when `var(--tw-ring-color)` makes the box-shadow invalid at
   * computed-value time. So this block proves the mechanism on the three
   * properties where the runtime is a faithful oracle - which is 254 of the 258
   * occurrences - and does not pretend to prove the other four.
   */
  const PROPERTIES = ["background-color", "color", "border-color"] as const;

  it.each(PROPERTIES)("%s drops a bare dashed-ident and keeps var()", (property) => {
    const style = document.createElement("div").style;

    style.setProperty(property, "--accent");
    expect(
      style.getPropertyValue(property),
      `${property} accepted a bare dashed-ident. If that is now valid CSS, this ` +
        "guard's premise is gone and the whole file should be retired, not patched."
    ).toBe("");

    style.setProperty(property, "var(--accent)");
    expect(style.getPropertyValue(property)).toBe("var(--accent)");
  });
});
