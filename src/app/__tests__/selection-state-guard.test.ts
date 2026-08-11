/**
 * Selection state must exist in the accessibility tree, not only in CSS.
 *
 * Source A: every shipped `.tsx` under `src/app` - the buttons themselves.
 * Source B: nothing. This guard has one source, because the rule is about a
 *   single element being internally complete: a button that PAINTS itself
 *   selected must also SAY it is selected.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `globals.css` gives `.category-chip.is-selected` an accent border and a glow,
 * and up to `a5a9601` that class was the ONLY carrier of "this is the category
 * you picked" on two surfaces: the fifteen chips on `/focus` and the fifteen in
 * `onboarding.tsx`'s customize step. Neither carried `aria-pressed`, so a
 * screen-reader user was read fifteen identical buttons with no indication of
 * which one was active, and the `/focus` container made it worse by declaring
 * `role="list"` around children that were all `<button>` - ARIA's `list`
 * requires owned `listitem` children, so what was announced was a named list of
 * zero items.
 *
 * The repo already knew how to do this: `/now`'s duration chips
 * (`aria-pressed={minutes === d}`), `/slicer`'s step toggles
 * (`aria-pressed={s.completed}`) and `theme-toggle.tsx`
 * (`aria-pressed={theme === "dark"}`) all state it. Two surfaces out of five
 * getting it wrong is a vocabulary that is followed by habit, and habit is
 * exactly what this repo keeps replacing with a check. Found by the QA pass of
 * 2026-08-10, which was driving `/focus`'s handlers for the first time.
 *
 * WHAT IS CHECKED, AND HOW PRECISELY
 * -----------------------------------
 * Per BUTTON, not per file. The scan extracts each `<button ...>` OPENING TAG
 * with a brace- and quote-aware reader (className values here are template
 * literals full of `${}` and nested ternaries, so a regex that stopped at the
 * first `>` or the first `}` would cut tags in half), and any opening tag that
 * applies `is-selected` must also carry `aria-pressed`. A file-level rule was
 * rejected: it would pass a file that has one correct chip and one broken one,
 * which is precisely the shape of `onboarding.tsx`, whose preset buttons and
 * category chips sit forty lines apart.
 *
 * `aria-checked` and `aria-current` are accepted alternatives. They express the
 * same fact for a radio-shaped or navigation-shaped control, and a future chip
 * group that legitimately becomes a `radiogroup` should not have to weaken this
 * guard to ship.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = "src/app";

/** The CSS class that paints a chip as chosen. */
const SELECTED_CLASS = "is-selected";

/** Any one of these makes the state readable; the first is the repo's default. */
const STATE_ATTRIBUTES = ["aria-pressed", "aria-checked", "aria-current"];

/**
 * Anchors for the blindness control, named as FILES rather than as directories.
 *
 * A control that loops over the same directory list the scan uses is not a
 * control: deleting an entry blinds the scan and empties the loop at once, and
 * `roadmap-guard-count.test.ts` documents that exact mistake being caught by
 * running the sabotage. These two live in different subtrees of `src/app` (a
 * route file and a component file), so one edit cannot blind the walk quietly.
 */
const WALK_ANCHORS = ["src/app/focus/page.tsx", "src/app/components/onboarding.tsx"];

/** Read with line endings normalised: CRLF on Windows, LF on the Linux runner. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/** Every shipped `.tsx` under `src/app`, repo-relative, tests excluded. */
function shippedTsxFiles(): string[] {
  const found: string[] = [];

  function walk(relDir: string): void {
    for (const entry of readdirSync(path.join(ROOT, relDir), { withFileTypes: true })) {
      const relPath = `${relDir}/${entry.name}`;

      if (entry.isDirectory()) {
        if (entry.name === "__tests__") {
          continue;
        }
        walk(relPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        found.push(relPath);
      }
    }
  }

  walk(APP_DIR);
  return found.sort();
}

/**
 * Every `<button ...>` opening tag in `source`, each returned verbatim.
 *
 * Brace depth and quotes are both tracked, because the attribute text in this
 * repo routinely contains `>` and `}` inside template literals and ternaries.
 * The tag ends at the first `>` seen at brace depth 0 outside any quote.
 */
export function buttonOpeningTags(source: string): string[] {
  const tags: string[] = [];
  const needle = "<button";
  let index = source.indexOf(needle);

  while (index !== -1) {
    let depth = 0;
    let quote: string | null = null;
    let cursor = index + needle.length;

    while (cursor < source.length) {
      const character = source[cursor];

      if (quote) {
        if (character === quote) {
          quote = null;
        }
      } else if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
      } else if (character === ">" && depth === 0) {
        break;
      }

      cursor += 1;
    }

    tags.push(source.slice(index, cursor + 1));
    index = source.indexOf(needle, cursor);
  }

  return tags;
}

function appliesSelectedClass(tag: string): boolean {
  return tag.includes(SELECTED_CLASS);
}

function statesItsSelection(tag: string): boolean {
  return STATE_ATTRIBUTES.some((attribute) => tag.includes(attribute));
}

describe("a chip that paints itself selected also says so", () => {
  const files = shippedTsxFiles();

  it("walks the whole shipped app tree (blindness control for the scan)", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);

    for (const anchor of WALK_ANCHORS) {
      expect(
        files,
        `the walk did not reach ${anchor}; either it is blind to that subtree or the file moved, ` +
          "and both need a deliberate answer",
      ).toContain(anchor);
    }
  });

  it("reads a whole opening tag, template literals and all (control for the extractor)", () => {
    // A realistic tag: multi-line, a template-literal className carrying a
    // nested ternary, double quotes inside braces, and a `>` in a comparison.
    // Every one of those broke a simpler reader during this guard's drafting.
    const broken = [
      "<div>",
      "  <button",
      "    key={area}",
      "    type=\"button\"",
      "    disabled={count > 0}",
      "    className={`category-chip ${",
      "      picked === area ? \"is-selected border-(--accent)\" : \"bg-(--field)\"",
      "    }`}",
      "    onClick={() => pick(area)}",
      "  >",
      "    {area}",
      "  </button>",
      "</div>",
    ].join("\n");

    const tags = buttonOpeningTags(broken);
    expect(tags).toHaveLength(1);
    expect(tags[0].endsWith(">")).toBe(true);
    expect(tags[0]).toContain("onClick");
    expect(appliesSelectedClass(tags[0])).toBe(true);

    // FIRES on the defect...
    expect(statesItsSelection(tags[0])).toBe(false);

    // ...and stays silent once the state is stated. Both halves are asserted
    // here, so a matcher that has stopped matching anything cannot pass this.
    const fixed = broken.replace("key={area}", "key={area}\n    aria-pressed={picked === area}");
    const fixedTags = buttonOpeningTags(fixed);
    expect(fixedTags).toHaveLength(1);
    expect(appliesSelectedClass(fixedTags[0])).toBe(true);
    expect(statesItsSelection(fixedTags[0])).toBe(true);

    // A self-closing tag and a second sibling are both found, so a file with
    // several buttons is not silently read as having one.
    expect(buttonOpeningTags('<button aria-pressed={a} />\n<button type="button">x</button>')).toHaveLength(2);
  });

  it("finds the chips that exist, so the rule is not vacuous today", () => {
    const selectedChips = files.flatMap((file) =>
      buttonOpeningTags(readText(path.join(ROOT, file)))
        .filter(appliesSelectedClass)
        .map((tag) => ({ file, tag })),
    );

    expect(
      selectedChips.length,
      `no button in ${APP_DIR} applies "${SELECTED_CLASS}". If the chip vocabulary was renamed, ` +
        "point this guard at the new class in the same commit; do not delete it.",
    ).toBeGreaterThanOrEqual(2);
  });

  it("has no chip that paints a selection without stating it", () => {
    const silent: string[] = [];

    for (const file of files) {
      for (const tag of buttonOpeningTags(readText(path.join(ROOT, file)))) {
        if (appliesSelectedClass(tag) && !statesItsSelection(tag)) {
          silent.push(`${file}: ${tag.split("\n")[0].trim()}`);
        }
      }
    }

    expect(
      silent,
      `these buttons apply "${SELECTED_CLASS}" but carry none of ${STATE_ATTRIBUTES.join(", ")}, ` +
        "so the selection they paint is invisible to a screen reader:\n" +
        silent.join("\n"),
    ).toEqual([]);
  });
});
