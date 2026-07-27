/**
 * Drift guard between the manifest version and the lockfile's copies of it.
 *
 * Source A: `package.json` — the version, bumped once per shipped milestone.
 * Source B: `package-lock.json` — which stores that version TWICE (the root
 *   `version` field and `packages[""].version`), both written only when npm
 *   itself runs (`npm install`, `npm uninstall`, ...), never by hand-editing
 *   the manifest.
 *
 * The defect this exists to catch: a milestone PR bumps `package.json` without
 * regenerating the lockfile, so the lockfile silently stops being a product of
 * the manifest next to it. That happened for real — the v0.12 and v0.13 bumps
 * left the lockfile at 0.11.0, found only incidentally in the PR #119
 * dependency-surface pass (an `npm uninstall` resynced it as a side effect),
 * and PR #121 had to resync both fields again one milestone later. Benign for
 * `npm ci` (which does not resolve from that field), but it is a receipt that
 * the lockfile was not regenerated across releases, and this repo's recurring
 * defect class is exactly two artifacts that must agree drifting silently.
 * The PR #119 Bugs entry filed this guard as the candidate for the next
 * DevSecOps slot; this is that guard.
 *
 * Nothing else in the repo reads these two files together; this test reads
 * BOTH live rather than restating either.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "package.json");
const LOCKFILE_PATH = path.join(ROOT, "package-lock.json");

const SEMVER = /^\d+\.\d+\.\d+$/;

interface Manifest {
  name?: string;
  version?: string;
}

interface Lockfile {
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, { version?: string }>;
}

function readJson<T>(absPath: string): T {
  return JSON.parse(readFileSync(absPath, "utf-8")) as T;
}

describe("package-lock.json version parity with package.json", () => {
  const manifest = readJson<Manifest>(MANIFEST_PATH);
  const lockfile = readJson<Lockfile>(LOCKFILE_PATH);

  it("still finds every field it compares (negative control for the parser)", () => {
    // Without this, an npm lockfile-format change that drops or moves either
    // copy would make the parity assertions below compare undefined against a
    // real version — or worse, undefined against undefined — and the guard
    // would go silently blind instead of failing.
    expect(manifest.version, "package.json has no version").toMatch(SEMVER);
    expect(
      lockfile.lockfileVersion,
      "lockfileVersion < 2 has no packages[\"\"] entry; this guard must be rewritten for it"
    ).toBeGreaterThanOrEqual(2);
    expect(lockfile.version, "package-lock.json has no root version").toMatch(SEMVER);
    expect(
      lockfile.packages?.[""]?.version,
      "package-lock.json has no packages[\"\"].version"
    ).toMatch(SEMVER);
  });

  it("keeps the lockfile's root version equal to the manifest version", () => {
    expect(
      lockfile.version,
      "package-lock.json's root version drifted from package.json — a version bump " +
        "edited the manifest without running npm install (the v0.12/v0.13 defect, " +
        "found in the PR #119 pass); regenerate the lockfile in the bump commit"
    ).toBe(manifest.version);
  });

  it('keeps the lockfile\'s packages[""].version equal to the manifest version', () => {
    expect(
      lockfile.packages?.[""]?.version,
      "package-lock.json's packages[\"\"].version drifted from package.json — npm " +
        "writes both copies together, so this diverging means the lockfile was " +
        "hand-edited or only half-regenerated; run npm install and commit the result"
    ).toBe(manifest.version);
  });
});
