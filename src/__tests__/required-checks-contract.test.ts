/**
 * Branch-protection contract guard: a required check must be one that every
 * pull request actually receives.
 *
 * Source A: `.github/required-checks.json` — the committed claim about what
 *   `main`'s branch protection requires, and what it deliberately does not.
 * Source B: `.github/workflows/` — the workflows that post those checks, read
 *   live rather than restated.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Branch protection is repo state, not repository content, so nothing in a diff
 * has ever had to agree with it. Two failure shapes follow from that, and this
 * repo has met both ends of them:
 *
 *   1. UNDER-GATING. Protection required only `lint-and-build`, a name left over
 *      from a pre-consolidation workflow, so typecheck and tests never blocked a
 *      merge. PR #86 fixed it by making the consolidated job post that same name.
 *   2. OVER-GATING, which is the worse one and the reason this guard exists now
 *      that a second context is being required. A required context that some PRs
 *      never receive wedges those PRs forever, with no way out except an admin
 *      touching the setting. The near misses are all in this repo already:
 *      `security-audit.yml`'s pull_request trigger is `paths`-filtered to the
 *      workflow file itself, and `deploy-pages.yml` / `dev-agent-runner.yml` do
 *      not run on pull_request at all. Requiring any of their jobs looks
 *      completely reasonable in the GitHub settings UI and blocks everything.
 *
 * So the rule enforced here is narrow and mechanical: every context declared
 * REQUIRED must be posted by a workflow in this repository whose pull_request
 * trigger is unconditional — no `paths:`, no `paths-ignore:`, and any
 * `branches:` filter must include the protected branch.
 *
 * WHAT THIS GUARD CANNOT DO
 * -------------------------
 * It cannot read the live setting. That needs a token and a network call, and
 * the gate runs offline. So this file proves the declaration is INTERNALLY
 * SOUND — that requiring these names cannot wedge a PR — not that GitHub is
 * currently configured this way. The reconciliation command is in the JSON's
 * own readme, and it is run by hand whenever protection changes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, ".github/workflows");
const DECLARATION_PATH = path.join(ROOT, ".github/required-checks.json");

interface DeclaredCheck {
  context: string;
  postedBy: string;
  kind: string;
  why: string;
  requiredSince?: string;
}

interface Declaration {
  protectedBranch: string;
  required: DeclaredCheck[];
  observational: DeclaredCheck[];
}

/** Read with line endings normalised: this repo is checked out with CRLF on
 * Windows and LF on the Linux runner, so every regex below must see the same
 * text in both places. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Drop full-line YAML comments, so prose ABOUT a trigger is never read as one.
 * `lighthouse.yml` and `security-audit.yml` both discuss their own triggers in
 * their header comments. */
function withoutComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** Glob-discovered rather than listed, so a seventh workflow is covered the day
 * it is added. Sorted so a failure reads the same on every run. */
function discoverWorkflows(): string[] {
  return readdirSync(WORKFLOW_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * The lines of a top-level block, e.g. `on:` or `jobs:`: everything after the
 * key until the next line at indent 0. Returns an empty array when the key is
 * absent, which every caller treats as "this workflow does not have that".
 */
function topLevelBlock(source: string, key: string): string[] {
  const lines = withoutComments(source).split("\n");
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line));
  if (start === -1) {
    return [];
  }

  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!isBlank(lines[i]) && indentOf(lines[i]) === 0) {
      break;
    }
    block.push(lines[i]);
  }
  return block;
}

/**
 * The sub-block of a key nested one level inside a top-level block, e.g. the
 * body of `pull_request:` inside `on:`. Empty array when the key is absent OR
 * present with no body (`pull_request:` on its own line is the unconditional
 * form), so callers must distinguish those two with `hasTrigger` below.
 */
function nestedBlock(block: string[], key: string): string[] {
  const start = block.findIndex((line) => new RegExp(`^\\s{2}${key}:\\s*$`).test(line));
  if (start === -1) {
    return [];
  }

  const body: string[] = [];
  for (let i = start + 1; i < block.length; i += 1) {
    if (isBlank(block[i])) {
      continue;
    }
    if (indentOf(block[i]) <= 2) {
      break;
    }
    body.push(block[i]);
  }
  return body;
}

function hasTrigger(onBlock: string[], key: string): boolean {
  return onBlock.some((line) => new RegExp(`^\\s{2}${key}:\\s*$`).test(line));
}

/** The values of a YAML list under `key:` in a trigger body, in either the
 * block form (`- main`) or the flow form (`[main]`). */
function triggerList(prBody: string[], key: string): string[] | null {
  const start = prBody.findIndex((line) => new RegExp(`^\\s*${key}:`).test(line));
  if (start === -1) {
    return null;
  }

  const flow = new RegExp(`^\\s*${key}:\\s*\\[(.*)\\]\\s*$`).exec(prBody[start]);
  if (flow) {
    return flow[1]
      .split(",")
      .map((value) => value.trim().replace(/^["']|["']$/g, ""))
      .filter((value) => value.length > 0);
  }

  const keyIndent = indentOf(prBody[start]);
  const values: string[] = [];
  for (let i = start + 1; i < prBody.length; i += 1) {
    if (isBlank(prBody[i])) {
      continue;
    }
    if (indentOf(prBody[i]) <= keyIndent) {
      break;
    }
    const item = /^\s*-\s*(.+?)\s*$/.exec(prBody[i]);
    if (!item) {
      break;
    }
    values.push(item[1].replace(/^["']|["']$/g, ""));
  }
  return values;
}

interface PullRequestTrigger {
  /** The workflow runs on pull_request at all. */
  present: boolean;
  /** Reasons this trigger can skip a given PR. Empty means unconditional. */
  skipReasons: string[];
}

function pullRequestTrigger(source: string, protectedBranch: string): PullRequestTrigger {
  const onBlock = topLevelBlock(source, "on");
  if (!hasTrigger(onBlock, "pull_request")) {
    return { present: false, skipReasons: ["there is no pull_request: trigger"] };
  }

  const body = nestedBlock(onBlock, "pull_request");
  const skipReasons: string[] = [];

  for (const filter of ["paths", "paths-ignore"]) {
    if (triggerList(body, filter) !== null) {
      skipReasons.push(`its pull_request trigger has a \`${filter}:\` filter, so a PR that touches nothing matching it never gets this check`);
    }
  }

  const branches = triggerList(body, "branches");
  if (branches !== null && !branches.includes(protectedBranch)) {
    skipReasons.push(`its pull_request \`branches:\` filter (${branches.join(", ")}) does not include ${protectedBranch}`);
  }

  return { present: true, skipReasons };
}

/**
 * Every check-run / status name this workflow can post, which is two different
 * things and both matter:
 *
 *  - JOB NAMES. A job's check run is named by its `name:` at job level, falling
 *    back to the job key. Only indent-4 `name:` counts, so step names (indent 6)
 *    and `with:` keys such as `name: coverage-report` (indent 10) are not read
 *    as jobs.
 *  - SYNTHESISED NAMES. `ci.yml`'s last step posts the `lint-and-build` status
 *    and check run through actions/github-script, so that name exists in no job
 *    key anywhere. Those literals are QUOTED in the script body, which is what
 *    distinguishes them from the unquoted YAML `name:` values above.
 */
function postedNames(source: string): string[] {
  const names = new Set<string>();

  const jobsBlock = topLevelBlock(source, "jobs");
  for (let i = 0; i < jobsBlock.length; i += 1) {
    const jobKey = /^\s{2}([A-Za-z0-9_-]+):\s*$/.exec(jobsBlock[i]);
    if (!jobKey) {
      continue;
    }

    let effective = jobKey[1];
    for (let j = i + 1; j < jobsBlock.length; j += 1) {
      if (!isBlank(jobsBlock[j]) && indentOf(jobsBlock[j]) <= 2) {
        break;
      }
      const jobName = /^\s{4}name:\s*(.+?)\s*$/.exec(jobsBlock[j]);
      if (jobName) {
        effective = jobName[1].replace(/^["']|["']$/g, "");
        break;
      }
    }
    names.add(effective);
  }

  for (const match of withoutComments(source).matchAll(/(?:context|name):\s*"([^"]+)"/g)) {
    names.add(match[1]);
  }

  return [...names].sort();
}

const declaration = JSON.parse(readText(DECLARATION_PATH)) as Declaration;
const workflows = discoverWorkflows();
const sources = new Map(workflows.map((name) => [name, readText(path.join(WORKFLOW_DIR, name))]));

/**
 * Anchors for the blindness control, named independently of the scan and of
 * each other. A parser that stopped finding jobs, stopped finding the
 * synthesised status, or stopped seeing a `paths:` filter fails HERE rather
 * than reporting a clean scan of nothing.
 */
const PARSER_ANCHORS = [
  { workflow: "ci.yml", name: "lint-and-build", note: "the synthesised status posted by github-script" },
  { workflow: "ci.yml", name: "quality-gate", note: "a job key with no job-level name:" },
  { workflow: "lighthouse.yml", name: "lighthouse", note: "a job with an explicit job-level name:" },
];

describe("the declared required checks are checks every pull request receives", () => {
  it("reads the declaration and the workflows (negative control for the scan)", () => {
    expect(workflows.length, ".github/workflows/ yielded no workflow files").toBeGreaterThan(0);
    expect(declaration.required.length, ".github/required-checks.json declares no required contexts").toBeGreaterThan(0);
    expect(
      declaration.observational.length,
      ".github/required-checks.json declares no observational contexts, which cannot be right while unrequired checks post on every PR",
    ).toBeGreaterThan(0);
    expect(declaration.protectedBranch, "the declaration names no protected branch").toBeTruthy();

    for (const anchor of PARSER_ANCHORS) {
      expect(
        postedNames(sources.get(anchor.workflow) ?? ""),
        `the parser did not find "${anchor.name}" in ${anchor.workflow} (${anchor.note}); either it went blind or that workflow changed, and both need a deliberate answer`,
      ).toContain(anchor.name);
    }

    // security-audit.yml is the repo's live example of a PR trigger that skips
    // most PRs. If this stops being detected, the whole over-gating half of the
    // guard is inert while still reporting green.
    expect(
      pullRequestTrigger(sources.get("security-audit.yml") ?? "", declaration.protectedBranch).skipReasons.length,
      "the trigger parser no longer sees security-audit.yml's paths: filter, so it can no longer tell a full-coverage check from a conditional one",
    ).toBeGreaterThan(0);
  });

  it("posts every required context from a workflow in this repository", () => {
    const offenders = declaration.required
      .filter((check) => check.postedBy === "external" || !sources.has(check.postedBy))
      .map((check) => `"${check.context}" claims to come from ${check.postedBy}, which is not a workflow file in .github/workflows/`);

    expect(
      offenders,
      "a required context must be posted by a workflow this repository can inspect; nothing committed here can prove an external app posts on every PR:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("requires only contexts whose workflow runs on every pull request", () => {
    const offenders: string[] = [];

    for (const check of declaration.required) {
      const source = sources.get(check.postedBy);
      if (!source) {
        continue; // already reported by the test above
      }

      const trigger = pullRequestTrigger(source, declaration.protectedBranch);
      for (const reason of trigger.skipReasons) {
        offenders.push(`"${check.context}" (${check.postedBy}): ${reason}`);
      }
    }

    expect(
      offenders,
      "these required contexts can be absent from a pull request, and a required context that never arrives wedges that PR with no way out except an admin changing the setting:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("names required contexts that the workflow actually posts", () => {
    const offenders: string[] = [];

    for (const check of declaration.required) {
      const source = sources.get(check.postedBy);
      if (!source) {
        continue;
      }

      const posted = postedNames(source);
      if (!posted.includes(check.context)) {
        offenders.push(`"${check.context}" is not posted by ${check.postedBy}; that workflow posts: ${posted.join(", ")}`);
      }
    }

    expect(
      offenders,
      "a required context name that matches no check the workflow posts blocks every PR forever:\n" + offenders.join("\n"),
    ).toEqual([]);
  });

  it("classifies every job that reports on every pull request", () => {
    const classified = new Set(
      [...declaration.required, ...declaration.observational].map((check) => check.context),
    );
    const unclassified: string[] = [];

    for (const [workflow, source] of sources) {
      const trigger = pullRequestTrigger(source, declaration.protectedBranch);
      if (!trigger.present || trigger.skipReasons.length > 0) {
        continue;
      }

      for (const name of postedNames(source)) {
        if (!classified.has(name)) {
          unclassified.push(`${workflow} posts "${name}" on every PR, and .github/required-checks.json says nothing about it`);
        }
      }
    }

    expect(
      unclassified,
      "a new check that reports on every PR is a merge-gate decision, so it is declared required or declared observational with a reason; it is not left undeclared:\n" +
        unclassified.join("\n"),
    ).toEqual([]);
  });

  it("declares each context exactly once", () => {
    const all = [...declaration.required, ...declaration.observational].map((check) => check.context);
    const duplicates = all.filter((context, index) => all.indexOf(context) !== index);

    expect(duplicates, "a context declared both required and observational has no single answer").toEqual([]);
  });

  it("dates every required context and says why it is required", () => {
    const undated = declaration.required
      .filter((check) => !/^\d{4}-\d{2}-\d{2}$/.test(check.requiredSince ?? "") || check.why.trim().length < 40)
      .map((check) => check.context);

    expect(
      undated,
      "a required context carries the date it became required and the reason, so a future run can re-test the decision instead of inheriting it",
    ).toEqual([]);
  });
});
