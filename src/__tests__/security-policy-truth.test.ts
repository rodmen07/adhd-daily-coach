/**
 * Drift guard between the repo's published security policy and the repo.
 *
 * Source A: `SECURITY.md` - the only document a would-be reporter is pointed at
 *   by GitHub's own "Security" tab.
 * Source B: `package.json` - the version that actually ships, and the package
 *   name that identifies the repository the reporting link must lead to.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Until this suite landed, `SECURITY.md` was GitHub's unmodified template. It
 * advertised security support for versions `5.1.x` and `4.0.x` of an app whose
 * `package.json` read `0.21.0`, listed a `5.0.x` and a `< 4.0` as unsupported,
 * and still contained the template's instructions to the author ("Use this
 * section to tell people...", "Tell them where to go..."). Every fact in the
 * repo's only published security-contact document was false, and nothing in the
 * gate could tell, because prose about versions is exactly the class of claim no
 * build step reads. That is the same defect shape `roadmap-milestone-status` and
 * `lockfile-version-parity` were each written for, in the one document whose
 * whole job is being true to an outsider.
 *
 * WHAT IT CHECKS, AND WHY THE VERSION RULE IS SHAPED THIS WAY
 * -----------------------------------------------------------
 * The rule is "every version-shaped token in SECURITY.md must be derivable from
 * `package.json`'s version", NOT "SECURITY.md must state the current version".
 * The second rule would force a third file to be bumped at every milestone
 * alongside the manifest and the lockfile, and a doc edit demanded by a bump is
 * a doc edit that eventually gets skipped. The first rule lets the document say
 * what is actually true forever - one supported version, whatever `main` reads -
 * while still failing loudly the moment a stale number reappears. Restoring the
 * old template turns this suite red on three separate assertions.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const POLICY_PATH = path.join(ROOT, "SECURITY.md");
const MANIFEST_PATH = path.join(ROOT, "package.json");

/** Read with line endings normalised: this repo is checked out with CRLF on
 * Windows and LF on the Linux runner, so every regex must see the same text. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/**
 * Phrases that exist only in GitHub's SECURITY.md template, addressed to the
 * repository author rather than to a reporter. Their presence means nobody ever
 * wrote the policy, whatever else the file happens to contain.
 */
const TEMPLATE_INSTRUCTIONS = [
  "Use this section to tell people",
  "Tell them where to go",
  "what to expect if the vulnerability is accepted or",
];

/** Version-shaped tokens: `5.1`, `5.1.x`, `0.21.0`. */
const VERSION_TOKEN = /\b\d+\.\d+(?:\.(?:\d+|x))?\b/g;

const policy = readText(POLICY_PATH);
const manifest = JSON.parse(readText(MANIFEST_PATH)) as { name: string; version: string };

/** The forms of the shipped version a policy document may legitimately name. */
function acceptableVersionTokens(version: string): string[] {
  const [major, minor] = version.split(".");
  return [version, `${major}.${minor}`, `${major}.${minor}.x`];
}

describe("SECURITY.md vs. the repository it speaks for", () => {
  it("reads both sources (negative control for the scan)", () => {
    // Without this, a mistyped path would read an empty string and every
    // assertion below would pass vacuously.
    expect(policy.length, "SECURITY.md is empty or was not found").toBeGreaterThan(500);
    expect(
      /^\d+\.\d+\.\d+$/.test(manifest.version),
      `package.json version did not parse as a semver: "${manifest.version}"`,
    ).toBe(true);
    expect(manifest.name, "package.json has no name to build the reporting URL from").toBeTruthy();
  });

  it("is not still GitHub's unwritten template", () => {
    for (const phrase of TEMPLATE_INSTRUCTIONS) {
      expect(
        policy.includes(phrase),
        `SECURITY.md still contains the template's instruction to the author: "${phrase}"`,
      ).toBe(false);
    }
  });

  it("names no version that disagrees with package.json", () => {
    const acceptable = acceptableVersionTokens(manifest.version);
    const claimed = [...new Set(policy.match(VERSION_TOKEN) ?? [])];
    const contradictions = claimed.filter((token) => !acceptable.includes(token));

    expect(
      contradictions,
      `SECURITY.md claims version(s) ${contradictions.join(", ")} but package.json ships ` +
        `${manifest.version}; the only tokens it may name are ${acceptable.join(", ")}, and naming ` +
        `none at all is the intended state`,
    ).toEqual([]);
  });

  it("points a reporter at this repository's private advisory form", () => {
    const expectedRoute = `/${manifest.name}/security/advisories/new`;

    expect(
      policy.includes(expectedRoute),
      `SECURITY.md does not contain a private reporting route ending in "${expectedRoute}", so the ` +
        `repo's only published security contact leads nowhere (or leads to a different repository)`,
    ).toBe(true);
    expect(
      policy.includes("https://github.com/"),
      "SECURITY.md's reporting route is not an absolute GitHub URL",
    ).toBe(true);
  });

  it("still points at the guard that enforces it", () => {
    // SECURITY.md tells the reader which test keeps it honest. Renaming or
    // deleting this suite without fixing that sentence would leave the document
    // citing a check that no longer exists, which is the same class of stale
    // prose the suite exists to prevent.
    expect(
      policy.includes("src/__tests__/security-policy-truth.test.ts"),
      "SECURITY.md no longer names the guard suite that enforces it",
    ).toBe(true);
  });
});
