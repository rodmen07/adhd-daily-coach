/**
 * Dependency-audit parity guard between the two workflows that run it.
 *
 * Source A: `.github/workflows/ci.yml` — the BLOCKING Quality Gate. Its
 *   "Dependency audit (high severity)" step is what actually stops a
 *   vulnerable dependency from merging, and the `lint-and-build` required
 *   status is reported only when the whole job passes.
 * Source B: `.github/workflows/security-audit.yml` — the DETECTOR. It runs
 *   the same audit on a daily schedule so a newly published advisory against
 *   the already-committed lockfile shows up in the run history within a day
 *   instead of the next time somebody opens a PR. That has wedged this
 *   repo's gate four times (fixes: PRs #99, #101, #102, #107).
 *
 * The detector is only worth anything while it audits exactly what the gate
 * audits. If ci.yml later tightens to `--audit-level=critical`, or the
 * detector is left behind on an older Node, the daily run keeps reporting
 * green about a threshold the gate no longer uses and the early warning is
 * silently gone. Nothing else in the repo compares these two files, so this
 * test reads BOTH of them live rather than restating either one.
 *
 * It also guards the gate itself in the two ways that would make the
 * blocking audit inert without any test noticing: deleting the audit step
 * from ci.yml, or marking it `continue-on-error`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CI_PATH = path.join(ROOT, ".github/workflows/ci.yml");
const AUDIT_PATH = path.join(ROOT, ".github/workflows/security-audit.yml");

/** Read a workflow with line endings normalised: this repo is checked out
 * with `core.autocrlf=true` on Windows (CRLF in the working tree) and LF on
 * the Linux runner, so every regex below must see the same text in both. */
function readWorkflow(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/** Drop full-line YAML comments so prose ABOUT a command is never mistaken
 * for the command. `security-audit.yml`'s header comment quotes the audit
 * invocation on purpose. */
function withoutComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** The distinct `--audit-level=X` thresholds a workflow actually runs. A SET,
 * because the detector prints its own command into the run summary, so the
 * same threshold legitimately appears more than once in one file. */
function auditLevels(source: string): string[] {
  const matches = withoutComments(source).matchAll(/--audit-level=([a-z]+)/g);
  return [...new Set([...matches].map((m) => m[1]))].sort();
}

/** The distinct `node-version:` values a workflow pins. */
function nodeVersions(source: string): string[] {
  const matches = withoutComments(source).matchAll(/node-version:\s*"?(\d+)"?/g);
  return [...new Set([...matches].map((m) => m[1]))].sort();
}

/** Split a job's steps on `      - name:` and return the one whose body runs
 * `npm audit`, so assertions about that step cannot accidentally read a
 * neighbouring step's keys. */
function auditStep(source: string): string | undefined {
  return source
    .split(/^ {6}- name: /m)
    .find((step) => /npm audit/.test(withoutComments(step)));
}

const CI = readWorkflow(CI_PATH);
const AUDIT = readWorkflow(AUDIT_PATH);

describe("dependency-audit parity between ci.yml and security-audit.yml", () => {
  it("both workflows run npm audit at the same threshold", () => {
    const ciLevels = auditLevels(CI);
    const detectorLevels = auditLevels(AUDIT);

    expect(ciLevels, "ci.yml no longer runs `npm audit --audit-level=...`").not.toEqual([]);
    expect(
      detectorLevels,
      "security-audit.yml no longer runs `npm audit --audit-level=...`",
    ).not.toEqual([]);
    expect(
      detectorLevels,
      "the daily detector audits a different threshold than the blocking gate, so it reports green about a bar the gate no longer uses",
    ).toEqual(ciLevels);
  });

  it("both workflows audit on the same Node major", () => {
    expect(nodeVersions(AUDIT), "detector and gate resolve dependencies on different Node majors, so their audits can disagree").toEqual(
      nodeVersions(CI),
    );
  });

  it("the blocking gate's audit step is still present and still fails the job", () => {
    const step = auditStep(CI);
    expect(step, "ci.yml has no step running `npm audit`").toBeDefined();
    expect(
      /continue-on-error/.test(step ?? ""),
      "ci.yml's audit step is marked continue-on-error, so a vulnerable dependency no longer blocks a merge",
    ).toBe(false);
  });

  it("the detector actually runs on a schedule and can be triggered by hand", () => {
    const triggers = withoutComments(AUDIT);
    expect(/^\s*schedule:/m.test(triggers), "security-audit.yml has no schedule: trigger, so nothing runs it between PRs").toBe(
      true,
    );
    expect(/^\s*-\s*cron:/m.test(triggers), "security-audit.yml's schedule: has no cron expression").toBe(true);
    expect(
      /^\s*workflow_dispatch:/m.test(triggers),
      "security-audit.yml cannot be run on demand, so a suspected advisory cannot be checked without waiting for the next scheduled run",
    ).toBe(true);
  });

  it("the detector re-runs on pull requests that change it, so it is never merged untested", () => {
    const triggers = withoutComments(AUDIT);
    expect(/^\s*pull_request:/m.test(triggers)).toBe(true);
    expect(
      triggers.includes(".github/workflows/security-audit.yml"),
      "security-audit.yml's pull_request paths filter no longer includes the workflow itself",
    ).toBe(true);
  });
});
