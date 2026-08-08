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
 *
 * THE NODE-MAJOR HALF IS NO LONGER ABOUT TWO FILES (widened 2026-08-08)
 * ---------------------------------------------------------------------
 * "the detector is left behind on an older Node" was written as a property of
 * this pair, so it was checked against a corpus of two hand-named paths. Every
 * other workflow in the directory was outside that corpus, which is NOT the
 * same as passing it and is indistinguishable from passing in every run:
 * `dev-agent-runner.yml` pinned `node-version: '20'` from the day it was
 * written, Node 20 reached end of life on 2026-04-30 (nodejs/Release
 * `schedule.json`, `v20.end`), and this suite was green for every one of those
 * days because that file was never one of the two it read.
 *
 * That workflow is also the worst one to leave on an unpatched runtime: it is
 * the only job in the repository with `contents: write` and
 * `pull-requests: write`, and the only one handed LLM API keys.
 *
 * So the Node-major assertions below DISCOVER `.github/workflows/` instead of
 * naming it, with `ci.yml` kept as the named authoritative instance (it is the
 * job that posts the required `lint-and-build` status, so a repo-wide "same
 * major" claim has to be anchored to the major the gate actually resolves
 * dependencies on) and `dev-agent-runner.yml` kept as a named anchor too,
 * because it is the file that drifted and a scan that stopped seeing it should
 * fail loudly rather than go quiet.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, ".github/workflows");
const CI_PATH = path.join(WORKFLOW_DIR, "ci.yml");
const AUDIT_PATH = path.join(WORKFLOW_DIR, "security-audit.yml");

/**
 * Named anchors for the discovery control. `ci.yml` is the authoritative
 * instance and `dev-agent-runner.yml` is the one that drifted; naming them as
 * FILES rather than deriving them from the scan is deliberate, because a
 * control that derives its expectations from the thing it is checking passes
 * exactly when the scan goes blind.
 */
const DISCOVERY_ANCHORS = ["ci.yml", "dev-agent-runner.yml"] as const;

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

/**
 * The distinct `node-version:` values a workflow pins.
 *
 * SINGLE quotes are matched as well as double, and that is not tidiness. This
 * pattern read `"?(\d+)"?` from the day it was written, which is every quoting
 * style the two workflows it was pointed at happen to use — and
 * `dev-agent-runner.yml`, the one file in this repository that had drifted,
 * wrote its pin as `node-version: '20'`. So on 2026-08-08, widening the corpus
 * to the whole directory was still not enough: the extractor returned an EMPTY
 * set for the offending file, the offender list came back `[]`, and a repo with
 * an end-of-life runtime in it read exactly like a repo where every workflow
 * agrees. It was caught by the discovery control below rather than by reading
 * this line, which is the argument for having that control at all.
 */
function nodeVersions(source: string): string[] {
  const matches = withoutComments(source).matchAll(/node-version:\s*['"]?(\d+)['"]?/g);
  return [...new Set([...matches].map((m) => m[1]))].sort();
}

/** Every workflow file in `.github/workflows/`, discovered rather than named,
 * so a workflow added later is inside this guard's corpus on the day it lands
 * instead of on the day somebody remembers to add its path here. */
function discoverWorkflows(): { file: string; source: string }[] {
  return readdirSync(WORKFLOW_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => ({
      file: entry.name,
      source: readWorkflow(path.join(WORKFLOW_DIR, entry.name)),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
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

describe("Node runtime parity across every workflow in .github/workflows", () => {
  const discovered = discoverWorkflows();
  const pinning = discovered.filter((workflow) => nodeVersions(workflow.source).length > 0);

  it("discovers the workflow directory rather than naming its files (control for the scan)", () => {
    // Without this, a scan that stopped matching — a renamed directory, a
    // `.yaml` extension, a `node-version:` regex broken by a quoting change —
    // would report an EMPTY set of offenders, which reads exactly like a
    // repository in which every workflow agrees.
    expect(
      discovered.map((workflow) => workflow.file),
      "the workflow scan found fewer files than this repository has, so it is blind rather than clean",
    ).toEqual(expect.arrayContaining([...DISCOVERY_ANCHORS]));

    expect(
      pinning.length,
      `only ${pinning.length} workflow(s) were seen pinning a node-version:, but this repository has several; ` +
        "the extractor has probably stopped matching rather than the pins having disappeared",
    ).toBeGreaterThanOrEqual(4);

    for (const anchor of DISCOVERY_ANCHORS) {
      expect(
        pinning.find((workflow) => workflow.file === anchor)?.file,
        `${anchor} sets up Node but was not seen pinning a node-version:; either the scan is blind to it ` +
          "or the pin was removed, and both need a deliberate answer",
      ).toBe(anchor);
    }
  });

  it("every workflow that sets up Node pins the same major as the blocking gate", () => {
    const expected = nodeVersions(CI);

    expect(
      expected,
      "ci.yml — the job behind the required lint-and-build status — no longer pins exactly one node-version:, " +
        "so there is no authoritative major to hold the others to",
    ).toHaveLength(1);

    const offenders = pinning
      .filter((workflow) => nodeVersions(workflow.source).join(",") !== expected.join(","))
      .map((workflow) => `${workflow.file} pins Node ${nodeVersions(workflow.source).join("/")}`);

    expect(
      offenders,
      `every workflow must resolve and run on the Node major the blocking gate uses (${expected.join("/")}, from ci.yml): ` +
        "a workflow left on an older major installs a different dependency tree than the one the gate cleared, " +
        "and an end-of-life major receives no security patches at all",
    ).toEqual([]);
  });
});
