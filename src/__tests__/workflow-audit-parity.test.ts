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
 *
 * SHARED-ACTION MAJOR PARITY (added 2026-08-09)
 * ---------------------------------------------
 * The same hole existed one level over, and it had already been exercised:
 * `actions/checkout` and `actions/setup-node` drifted to `@v4` in
 * `dev-agent-runner.yml` for exactly the reason the Node major did, and the
 * 2026-08-08 pass (PR #169) fixed those two instances BY HAND — the widened
 * guard watched `node-version:` only, so nothing stopped the next one.
 *
 * The rule, scoped deliberately: any action `uses:`d by MORE THAN ONE
 * workflow must resolve to ONE major across every workflow that uses it.
 * Single-WORKFLOW actions are unconstrained by parity ON PURPOSE — parity is
 * the wrong instrument for currency, and the backlog carries that question
 * separately (`actions/setup-python@v5` et al.). A control below proves the
 * boundary is real rather than accidental: loosening a single-use action
 * leaves this suite green.
 *
 * A ref the extractor cannot read as `v<major>` (a commit SHA, a branch
 * name) is reported as an offender rather than skipped, because this file's
 * own history says what silent skipping does: the Node-pin extractor
 * returned an empty set for the one file that had drifted, and the repo read
 * clean. If this repo ever moves to SHA pinning, that is a deliberate
 * posture change and this guard should be rewritten in the same commit.
 *
 * DEPENDENCY-REVIEW SEVERITY PARITY (added 2026-08-12)
 * ----------------------------------------------------
 * `.github/workflows/dependency-review.yml` is a THIRD reader of the same
 * question — "does this dependency carry a known advisory?" — asked of a
 * different database (GitHub's, via the dependency graph) and scoped to the
 * pull request's diff rather than the whole tree. It is a second opinion, not
 * a second gate: it is declared observational in `.github/required-checks.json`
 * and the blocking cover stays `npm audit --audit-level=high` in ci.yml.
 *
 * A second opinion is worth exactly nothing at a bar nobody else uses. So the
 * same reasoning that made this file compare ci.yml with security-audit.yml
 * applies once more: `fail-on-severity:` must equal ci.yml's
 * `--audit-level=`, or a tightening on one side leaves the other reporting
 * green about a threshold the gate no longer holds.
 *
 * Two more ways it could go inert without anything noticing, both mirrored
 * from the assertions already written above for ci.yml's audit step:
 * `warn-only: true` (the action's own documented way to always exit success,
 * i.e. `continue-on-error` by another name), and a `paths:` filter narrowing
 * the pull_request trigger. The second is not hypothetical — it is the exact
 * shape `security-audit.yml` has, which is why THAT check can never be
 * required, and a check quietly acquiring it would still read green on every
 * PR it no longer runs on.
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

/** Every `uses: owner/name@ref` step in one workflow's source. Full-line
 * comments are dropped first so prose about an action is never counted as a
 * use of it. Local (`./path`) and `docker://` uses would not match, which is
 * correct: they have no `@major` to hold to parity. */
function actionUses(source: string): { action: string; ref: string }[] {
  const matches = withoutComments(source).matchAll(
    /^\s*(?:-\s+)?uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@(\S+)/gm,
  );
  return [...matches].map((m) => ({ action: m[1], ref: m[2] }));
}

/** The census: action -> every (workflow, ref) pair that uses it. */
function actionCensus(
  workflows: { file: string; source: string }[],
): Map<string, { file: string; ref: string }[]> {
  const census = new Map<string, { file: string; ref: string }[]>();
  for (const workflow of workflows) {
    for (const { action, ref } of actionUses(workflow.source)) {
      const uses = census.get(action) ?? [];
      uses.push({ file: workflow.file, ref });
      census.set(action, uses);
    }
  }
  return census;
}

/** `v7` / `v7.1.0` -> "7"; anything else (a SHA, a branch) -> undefined. */
function majorOfRef(ref: string): string | undefined {
  return /^v(\d+)(\.\d+)*$/.exec(ref)?.[1];
}

describe("shared-action major parity across every workflow in .github/workflows", () => {
  const discovered = discoverWorkflows();
  const census = actionCensus(discovered);
  const shared = [...census.entries()].filter(
    ([, uses]) => new Set(uses.map((use) => use.file)).size > 1,
  );

  it("the action census reaches the real corpus rather than an empty one (control for the scan)", () => {
    // A broken `uses:` regex, a renamed directory, or a quoting change would
    // all report ZERO uses, and zero shared actions have zero parity
    // violations — a blind census reads exactly like a healthy repository.
    // Floors, not exact counts, so adding a workflow cannot redden this.
    const totalUses = [...census.values()].reduce((n, uses) => n + uses.length, 0);
    expect(
      totalUses,
      `the census found only ${totalUses} action uses across .github/workflows/, far fewer than this ` +
        "repository has; the extractor has probably stopped matching rather than the workflows having emptied",
    ).toBeGreaterThanOrEqual(15);

    // Named presence sentinels: the three actions KNOWN to be shared today.
    // If any stops being shared, that is a deliberate workflow redesign and
    // this list is updated in the same commit — loudly, not by drift.
    for (const anchor of ["actions/checkout", "actions/setup-node", "actions/upload-artifact"]) {
      expect(
        new Set((census.get(anchor) ?? []).map((use) => use.file)).size,
        `${anchor} was seen in fewer than two workflows; either the census is blind to it or the ` +
          "workflow set changed shape, and both need a deliberate answer here",
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("every action used by more than one workflow resolves to one major everywhere", () => {
    const offenders: string[] = [];
    for (const [action, uses] of shared) {
      const majors = new Set<string>();
      for (const use of uses) {
        const major = majorOfRef(use.ref);
        if (major === undefined) {
          offenders.push(
            `${use.file} pins ${action}@${use.ref}, whose major this guard cannot read; ` +
              "if the repo is moving to SHA pinning, rewrite this guard in the same commit",
          );
        } else {
          majors.add(major);
        }
      }
      if (majors.size > 1) {
        offenders.push(
          `${action} is pinned to ${uses.length} steps across ` +
            `${new Set(uses.map((use) => use.file)).size} workflows at majors {${[...majors].sort().join(", ")}}: ` +
            uses.map((use) => `${use.file} has @${use.ref}`).join("; "),
        );
      }
    }

    expect(
      offenders,
      "an action shared by several workflows drifted apart: the workflows now run DIFFERENT code for the same " +
        "step, and the stale major keeps receiving none of the fixes the current one gets — exactly how " +
        "dev-agent-runner.yml sat on checkout@v4/setup-node@v4 until 2026-08-08 with no gate noticing",
    ).toEqual([]);
  });
});

const DEPENDENCY_REVIEW_FILE = "dependency-review.yml";
const DEPENDENCY_REVIEW = readWorkflow(path.join(WORKFLOW_DIR, DEPENDENCY_REVIEW_FILE));

/** The distinct `fail-on-severity:` values a workflow sets. A SET for the same
 * reason `auditLevels` is one: the value can legitimately be written more than
 * once, and it is DISAGREEMENT that matters, not repetition. Single and double
 * quotes both matched — `node-version: '20'` is this file's own recorded proof
 * that an extractor which knows only one quoting style returns EMPTY for the
 * offending file and reads exactly like agreement. */
function failOnSeverities(source: string): string[] {
  const matches = withoutComments(source).matchAll(/fail-on-severity:\s*['"]?([a-z]+)['"]?/g);
  return [...new Set([...matches].map((m) => m[1]))].sort();
}

/** The action's documented "always complete with success" switch. Present-and-
 * false is fine; present-and-true makes `fail-on-severity` decorative. */
function warnOnlyEnabled(source: string): boolean {
  return /warn-only:\s*['"]?true['"]?/i.test(withoutComments(source));
}

/** The lines of the top-level `on:` block: everything after it until the next
 * line at indent 0. Empty when the workflow writes `on:` in the inline form,
 * which the caller treats as "the trigger shape could not be read". */
function triggerBlock(source: string): string[] {
  const lines = withoutComments(source).split("\n");
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (start === -1) {
    return [];
  }

  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length > 0 && line.length === line.trimStart().length) {
      break;
    }
    block.push(line);
  }
  return block;
}

describe("dependency review holds the same bar as the blocking audit", () => {
  it("is a workflow this repository actually carries, running the dependency-review action", () => {
    // Named rather than derived: if the file is renamed or deleted, every
    // assertion below would otherwise read its absence as agreement.
    expect(
      discoverWorkflows().map((workflow) => workflow.file),
      `${DEPENDENCY_REVIEW_FILE} is no longer in .github/workflows/; the dependency-review check is gone and ` +
        ".github/required-checks.json still declares it",
    ).toContain(DEPENDENCY_REVIEW_FILE);

    expect(
      actionUses(DEPENDENCY_REVIEW).map((use) => use.action),
      `${DEPENDENCY_REVIEW_FILE} no longer uses actions/dependency-review-action, so the workflow posts a ` +
        "check that reviews nothing",
    ).toContain("actions/dependency-review-action");
  });

  it("fails at the same severity the required audit fails at", () => {
    const reviewLevels = failOnSeverities(DEPENDENCY_REVIEW);

    expect(
      reviewLevels,
      `${DEPENDENCY_REVIEW_FILE} sets no readable fail-on-severity:, so it silently falls back to the action's ` +
        "own default (`low`) and this comparison has nothing to compare",
    ).toHaveLength(1);

    expect(
      reviewLevels,
      "dependency review blocks at a different severity than the blocking gate, so one of the two reports " +
        "green about a bar the other no longer uses — the same drift this file was written to stop between " +
        "ci.yml and security-audit.yml",
    ).toEqual(auditLevels(CI));
  });

  it("is not neutered by warn-only", () => {
    expect(
      warnOnlyEnabled(DEPENDENCY_REVIEW),
      "dependency-review.yml sets `warn-only: true`, which the action documents as always completing with " +
        "success: the check would stay permanently green and fail-on-severity would decide nothing. This is " +
        "the same failure as marking ci.yml's audit step continue-on-error, one workflow over",
    ).toBe(false);
  });

  it("runs on every pull request rather than a filtered subset", () => {
    const on = triggerBlock(DEPENDENCY_REVIEW);

    expect(
      on.some((line) => /^\s{2}pull_request:/.test(line)),
      "dependency-review.yml has no pull_request: trigger under a top-level `on:` block, so either it no " +
        "longer reviews pull requests or this parser cannot read its trigger shape",
    ).toBe(true);

    const filters = on.filter((line) => /^\s*paths(-ignore)?:/.test(line));
    expect(
      filters.map((line) => line.trim()),
      "dependency-review.yml's trigger acquired a paths filter, so a pull request that touches nothing " +
        "matching it never receives this check — and an absent check is indistinguishable from a passing one. " +
        "That is precisely why security-audit.yml's `audit` job can never be a required context",
    ).toEqual([]);
  });
});
