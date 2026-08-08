/**
 * Drift guard between the roadmap's shipped-version claim and `package.json`.
 *
 * Source A: `docs/ROADMAP.md` - the "Current state" section, whose surfaces
 *   bullet ends with a bolded sentence of the form
 *   `**package.json reads 0.22.0**`.
 * Source B: `package.json` - the version the repo actually ships.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * That one sentence is the roadmap's most recurrent falsehood, and it has now
 * been wrong FOUR separate times, each time by a different number of
 * milestones. Its own parenthetical is the record: it read "0.16.0" until
 * 2026-08-01 (two milestones stale), "0.18.0" until 2026-08-07 (three
 * milestones stale), and was corrected to "0.21.0" by the v0.22 definition
 * (PR #155) hours before v0.22 itself shipped and made it stale again.
 *
 * The mechanism is structural rather than careless. A milestone's completion PR
 * bumps `package.json` and flips one `### vN` heading, and
 * `roadmap-milestone-status.test.ts` makes both of those mandatory - but that
 * guard reads HEADINGS, so this sentence, which states the same fact in prose
 * a few hundred lines above, is invisible to it. The roadmap says as much about
 * itself: "it is the one claim in this bullet that the milestone-status guard
 * already checks from the other direction, via the headings, which is why the
 * headings were right the whole time this sentence was wrong."
 *
 * Four recurrences is a missing check, not a missing reminder. That sentence is
 * this repo's own recorded reasoning, written in
 * `roadmap-guard-count.test.ts` about the guard-count sentence after it went
 * stale four times, and applied here to the other half of the same bullet.
 *
 * WHY ONLY THE "CURRENT STATE" SECTION
 * ------------------------------------
 * `package.json reads <x.y.z>` appears seven more times in the file, and every
 * one of those is CORRECT while naming an older version: they sit inside a
 * milestone's done-when ("package.json reads 0.20.0") or inside the history
 * section, where the sentence describes what the version was, or must become,
 * at that milestone. A guard that swept the whole file would have to be either
 * wrong or weakened, so it reads exactly the one section that claims to
 * describe the repo NOW. The section is located by its heading rather than by
 * a line number so the file can keep growing above and below it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROADMAP_PATH = path.join(ROOT, "docs/ROADMAP.md");
const PACKAGE_PATH = path.join(ROOT, "package.json");

/** Read with line endings normalised: this repo is checked out with CRLF on
 * Windows and LF on the Linux runner, so every regex must see the same text. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/**
 * The body of `## Current state ...`, up to the next `## ` heading.
 *
 * A missing section throws rather than returning empty. An empty string would
 * make every assertion below vacuous, which is the failure mode this whole
 * family of guards exists to avoid.
 */
function currentStateSection(markdown: string): string {
  const start = /^## Current state\b.*$/m.exec(markdown);
  if (!start) {
    throw new Error(
      "docs/ROADMAP.md no longer has a '## Current state' heading. If the section was " +
        "renamed, update this parser in the same commit; do not delete the guard."
    );
  }

  const after = markdown.slice(start.index + start[0].length);
  const next = /^## /m.exec(after);

  return next ? after.slice(0, next.index) : after;
}

/** The version `package.json` actually declares. */
function shippedVersion(): string {
  const pkg = JSON.parse(readText(PACKAGE_PATH)) as { version?: string };
  if (!pkg.version) {
    throw new Error("package.json has no version field");
  }

  return pkg.version;
}

/**
 * Every `**package.json reads <x.y.z>**` claim in the section.
 *
 * Whitespace is collapsed first because the sentence is hard-wrapped, so the
 * break between "reads" and the number is a newline in the file and a space
 * here. Returned as a list, not a single match: if a later edit adds a second
 * copy of the claim, both are checked rather than only the first.
 */
function versionClaims(sectionMarkdown: string): string[] {
  const flat = sectionMarkdown.replace(/\s+/g, " ");

  return [...flat.matchAll(/\*\*package\.json reads (\d+\.\d+\.\d+)\*\*/g)].map((m) => m[1]);
}

describe("ROADMAP.md 'Current state' version claim vs. package.json", () => {
  const roadmap = readText(ROADMAP_PATH);
  const section = currentStateSection(roadmap);
  const claims = versionClaims(section);
  const shipped = shippedVersion();

  it("still finds the claim it exists to check (zero matches is a failure, not a pass)", () => {
    // Without this, deleting or rewording the sentence would turn the guard
    // green forever while the roadmap said nothing checkable at all - the
    // vacuous-assertion failure this repo has shipped before.
    expect(
      claims.length,
      "the 'Current state' section no longer states **package.json reads <x.y.z>**. " +
        "That sentence is what this guard checks; restore it or update this parser " +
        "in the same commit, but do not let the guard go quiet."
    ).toBeGreaterThan(0);
  });

  it("states the version the repo actually ships", () => {
    for (const claimed of claims) {
      expect(
        claimed,
        `docs/ROADMAP.md's "Current state" section says package.json reads ${claimed}, ` +
          `but package.json reads ${shipped}. This sentence has gone stale four times; ` +
          `the completion PR that bumps the version updates it in the same commit.`
      ).toBe(shipped);
    }
  });

  it("reads a section that really contains the surfaces bullet (control for the slice)", () => {
    // A heading regex that matched the wrong place, or a slice that stopped
    // early, would hand the assertions above an empty string and they would
    // pass by finding nothing. This anchors the slice to text that is only in
    // this section.
    expect(section).toContain("New surfaces since");
    expect(section.length).toBeGreaterThan(2000);
  });
});
