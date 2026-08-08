/**
 * Drift guard between the roadmap's list of guard suites and the guard suites
 * that actually exist.
 *
 * Source A: `docs/ROADMAP.md` - the "Current state" quality-gate bullet, which
 *   states a count in words ("**Nine** guard tests now run inside the gate...")
 *   and then names every one of them.
 * Source B: the filesystem - the guard suites themselves.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * That sentence is the single most reliable staleness generator in the
 * roadmap, and the roadmap says so about itself. It was written as "five" by
 * the v0.15 definition, corrected to "six" by the v0.16 definition after PR
 * #123 landed the same evening, corrected to "seven" by the v0.17 definition
 * after PR #127 landed hours later, and found stale again at "seven" on
 * 2026-08-01 when the real count was eight, because PR #136 added
 * `lighthouse-baseline-contract` and nothing made the prose follow.
 *
 * Four recurrences is a missing check, not a missing reminder. That is exactly
 * the reasoning that produced `roadmap-milestone-status.test.ts` for the
 * milestone HEADINGS after the same defect recurred three times; this file is
 * the same move for the half of the same document that guard could not read.
 *
 * WHAT COUNTS AS A GUARD SUITE, AND WHY THE RULE IS MECHANICAL
 * ------------------------------------------------------------
 * A guard suite here is a `.test.ts` file (not `.test.tsx`) directly under
 * `src/__tests__/` or `src/app/__tests__/`. That is not an arbitrary line:
 * those two directories hold the cross-cutting suites that read source files
 * and config as DATA, while every page and component test in the same tree is
 * `.test.tsx` because it renders JSX, and the per-module unit tests live in
 * `src/lib/__tests__/` instead. So the rule needs no hand-maintained list,
 * which is the whole point - a list of guards maintained by hand is the thing
 * that keeps going stale.
 *
 * A consequence worth stating out loud: adding a new guard suite fails this
 * test until the roadmap names it. That is the intended cost. The alternative
 * is what the repo had, which was a sentence that silently described a
 * different codebase.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROADMAP_PATH = path.join(ROOT, "docs/ROADMAP.md");

/** The two directories that hold cross-cutting guard suites. */
const GUARD_DIRS = ["src/__tests__", "src/app/__tests__"] as const;

/**
 * Anchors for the blindness control, one per directory, named as FILES rather
 * than as directories on purpose.
 *
 * The first draft of that control looped over `GUARD_DIRS` itself, which made
 * it useless: deleting a directory from `GUARD_DIRS` blinded the scan AND
 * emptied the loop, so the control passed while the scan could no longer see
 * half the repo. That was caught by running the sabotage rather than by reading
 * the code, and it is the same failure PR #120's file-walk control shipped and
 * had to be rewritten for. A control that derives its expectations from the
 * thing it is checking is not a control.
 *
 * These two suites exist, sit in different directories, and are named
 * independently here, so a single edit that blinds the scan fails this test.
 * Deleting either suite for real should fail here too: that is a decision
 * worth making deliberately, not silently.
 */
const BLINDNESS_ANCHORS: { name: string; dir: (typeof GUARD_DIRS)[number] }[] = [
  { name: "roadmap-milestone-status", dir: "src/__tests__" },
  { name: "theme-token-guard", dir: "src/app/__tests__" },
];

/** Read with line endings normalised: this repo is checked out with CRLF on
 * Windows and LF on the Linux runner, so every regex must see the same text. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/** Guard suite basenames on disk, e.g. "roadmap-milestone-status". */
function discoverGuardSuites(): { name: string; dir: string }[] {
  const found: { name: string; dir: string }[] = [];

  for (const dir of GUARD_DIRS) {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".test.ts")) {
        continue;
      }

      found.push({ name: entry.name.replace(/\.test\.ts$/, ""), dir });
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Number words the roadmap might reasonably use. An unknown word fails loudly
 * rather than being coerced, so "a dozen" cannot pass by parsing to NaN. */
const NUMBER_WORDS: Record<string, number> = {
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  // Compound words start here. The key is lower-cased before lookup, and the
  // hyphen is why the claim regex below matches `[\w-]+` rather than `\w+`:
  // `\w` excludes `-`, so `**Twenty-one**` failed the sentence match ENTIRELY
  // and threw "no longer contains the guard-suite sentence" before this map
  // was ever consulted. Both halves are needed; either alone still throws.
  "twenty-one": 21,
  "twenty-two": 22,
  "twenty-three": 23,
};

interface RoadmapClaim {
  countWord: string;
  count: number;
  names: string[];
}

/**
 * Parse the roadmap's claim. Whitespace is collapsed first because the sentence
 * is hard-wrapped across six lines, so every token boundary in the source is a
 * newline in some editions and a space in others.
 */
function parseRoadmapClaim(markdown: string): RoadmapClaim {
  const flat = markdown.replace(/\s+/g, " ");
  const match =
    /\*\*([\w-]+)\*\* guard tests now run inside the gate and compare two sources of truth rather than restating either: (.*?)\. \(This count/.exec(
      flat
    );

  if (!match) {
    throw new Error(
      "docs/ROADMAP.md no longer contains the guard-suite sentence this test reads. " +
        "If the sentence was rewritten, update this parser in the same commit; do not delete the guard."
    );
  }

  const countWord = match[1].toLowerCase();
  const count = NUMBER_WORDS[countWord];
  if (count === undefined) {
    throw new Error(`docs/ROADMAP.md states an unrecognised guard count word: "${match[1]}"`);
  }

  // Backticked tokens in the list. The prose also backticks non-names such as
  // `dark:` inside a parenthetical, so tokens are filtered to the shape a real
  // suite basename can have. Anything containing a character a filename here
  // cannot hold is not a claim about a suite.
  const backticked = [...match[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const names = backticked.filter((token) => /^[a-z][a-z0-9-]*$/.test(token)).sort();

  return { countWord, count, names };
}

describe("ROADMAP.md guard-suite list vs. the guard suites on disk", () => {
  const roadmap = readText(ROADMAP_PATH);
  const discovered = discoverGuardSuites();
  const claim = parseRoadmapClaim(roadmap);

  it("discovers guard suites from both directories (negative control for the scan)", () => {
    // Without this, a scan that went blind to one directory would keep passing
    // as long as the prose happened to agree with the half it could still see.
    expect(discovered.length).toBeGreaterThanOrEqual(5);

    for (const anchor of BLINDNESS_ANCHORS) {
      expect(
        discovered.find((suite) => suite.name === anchor.name),
        `the scan did not find ${anchor.name} under ${anchor.dir}; either it is blind to that ` +
          `directory or the suite was deleted, and both need a deliberate answer`
      ).toEqual(anchor);
    }

    expect(claim.names.length, "the roadmap sentence parsed to an empty list of names").toBeGreaterThan(0);
  });

  it("states a count that matches the number of guard suites that exist", () => {
    expect(
      claim.count,
      `docs/ROADMAP.md says "${claim.countWord}" guard tests run inside the gate, but ` +
        `${discovered.length} exist: ${discovered.map((s) => s.name).join(", ")}`
    ).toBe(discovered.length);
  });

  it("names exactly the guard suites that exist, no more and no fewer", () => {
    expect(
      claim.names,
      "the guard suites named in docs/ROADMAP.md do not match the ones on disk"
    ).toEqual(discovered.map((suite) => suite.name));
  });

  it("states a count that matches the list it then gives", () => {
    // The count word and the list are written by hand in the same sentence and
    // have disagreed with each other before they disagreed with the repo.
    expect(claim.names.length).toBe(claim.count);
  });
});
