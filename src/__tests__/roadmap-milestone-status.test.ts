/**
 * Drift guard between the roadmap's milestone headers and the shipped version.
 *
 * Source A: `docs/ROADMAP.md` — the milestone sections, each headed
 *   `### v0.N - <title> (<status>)`.
 * Source B: `package.json` — the version, which this project bumps once per
 *   shipped milestone (see the roadmap's versioning-convention note).
 *
 * The recurring defect this exists to catch: a milestone ships, package.json is
 * bumped in the implementation PR, and the roadmap section keeps its
 * "(agent-doable now)" header, so the file describes finished work as future
 * work. That has happened three milestones in a row and was corrected by hand
 * each time — v0.11 in PR #108, v0.12 in PR #112, and v0.13 in the product
 * pass that added this file. A defect
 * that recurs three times is a missing check, not a missing reminder, so the
 * comparison is made here instead of by the next reader.
 *
 * Both directions are guarded: a milestone at or below the shipped version must
 * declare a terminal status, and a milestone above it must not claim DONE
 * (the roadmap describing unshipped work as shipped is the same defect
 * pointing the other way, and it is the more dangerous one).
 *
 * Nothing else in the repo reads these two files together; this test reads BOTH
 * live rather than restating either.
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

interface Milestone {
  /** e.g. "0.13" */
  version: string;
  major: number;
  minor: number;
  /** The whole heading line, status marker included. */
  heading: string;
}

function parseMilestones(markdown: string): Milestone[] {
  const milestones: Milestone[] = [];

  for (const line of markdown.split("\n")) {
    const match = /^### v(\d+)\.(\d+)\b/.exec(line);
    if (!match) {
      continue;
    }

    milestones.push({
      version: `${match[1]}.${match[2]}`,
      major: Number(match[1]),
      minor: Number(match[2]),
      heading: line.trim(),
    });
  }

  return milestones;
}

function shippedVersion(): { major: number; minor: number } {
  const pkg = JSON.parse(readText(PACKAGE_PATH)) as { version?: string };
  const match = /^(\d+)\.(\d+)\./.exec(pkg.version ?? "");
  if (!match) {
    throw new Error(`package.json version is not major.minor.patch: ${pkg.version}`);
  }

  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** True when `milestone` is at or below the version package.json says shipped. */
function isAtOrBelowShipped(milestone: Milestone, shipped: { major: number; minor: number }): boolean {
  if (milestone.major !== shipped.major) {
    return milestone.major < shipped.major;
  }

  return milestone.minor <= shipped.minor;
}

/** Terminal statuses a milestone section may declare. DEPRIORITIZED is a real
 * state here: v0.5 (entitlement webhooks) is parked behind the 2026-07-19
 * frontend direction, and its version number stays reserved rather than being
 * reused, so it must not be forced to read DONE. */
const TERMINAL_STATUS = /\b(DONE|DEPRIORITIZED)\b/;

describe("ROADMAP.md milestone status vs. the shipped version", () => {
  const roadmap = readText(ROADMAP_PATH);
  const milestones = parseMilestones(roadmap);
  const shipped = shippedVersion();

  it("finds the milestone sections at all (negative control for the parser)", () => {
    // Without this, a heading-format change would make every assertion below
    // pass over an empty list and the guard would go silently blind.
    expect(milestones.length).toBeGreaterThanOrEqual(10);
    expect(milestones.map((m) => m.version)).toContain(`${shipped.major}.${shipped.minor}`);
  });

  it("marks every milestone at or below the shipped version DONE or DEPRIORITIZED", () => {
    const undeclared = milestones
      .filter((m) => isAtOrBelowShipped(m, shipped))
      .filter((m) => !TERMINAL_STATUS.test(m.heading))
      .map((m) => m.heading);

    expect(
      undeclared,
      `package.json reads ${shipped.major}.${shipped.minor}.x, so these shipped milestones must ` +
        `declare DONE (or DEPRIORITIZED) in their heading instead of describing themselves as future work`
    ).toEqual([]);
  });

  it("never lets a milestone above the shipped version claim DONE", () => {
    const overclaimed = milestones
      .filter((m) => !isAtOrBelowShipped(m, shipped))
      .filter((m) => /\bDONE\b/.test(m.heading))
      .map((m) => m.heading);

    expect(
      overclaimed,
      `package.json reads ${shipped.major}.${shipped.minor}.x, so these milestones cannot be DONE yet`
    ).toEqual([]);
  });

  it("keeps the milestone sections in ascending version order", () => {
    const versions = milestones.map((m) => m.major * 1000 + m.minor);
    const sorted = [...versions].sort((a, b) => a - b);

    expect(versions, "milestone sections are out of order in ROADMAP.md").toEqual(sorted);
  });
});
