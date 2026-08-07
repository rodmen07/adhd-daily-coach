/**
 * Least-privilege guard for secrets in GitHub Actions: a step that runs no
 * program must not be handed a secret.
 *
 * Source: every workflow under `.github/workflows/`, glob-discovered rather
 * than listed, so a seventh workflow is covered the day it is added.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `dev-agent-runner.yml` had a step named "Configure environment" whose entire
 * body was `echo "Environment configured"` and whose `env:` block injected four
 * secrets into it: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, and
 * GITHUB_TOKEN. Step-level `env:` is scoped to its own step and does not reach
 * the next one, so none of the four could ever be read: they were decrypted into
 * a runner environment purely to be discarded. It survived because it LOOKS like
 * setup. The cost of that shape is real - every extra step holding a live
 * credential is another process, another `set -x` away from a log, another thing
 * a compromised action in the same job can read - and no linter objects to it.
 *
 * WHAT "USES A SECRET" MEANS HERE, AND WHY IT IS NOT "MENTIONS THE VARIABLE"
 * --------------------------------------------------------------------------
 * The obvious rule - the step body must mention the env var it is given - is
 * wrong here, and would have produced two false positives on this repo's real
 * workflows. `deploy-pages.yml`'s "Build static site" step passes six
 * `NEXT_PUBLIC_FIREBASE_*` values to `npm run build`, and `dev-agent-runner.yml`
 * passes three API keys to `python agents/dev-agent/runner.py`; in both cases the
 * consumer reads `process.env` / `os.environ` and the variable name appears
 * nowhere in the YAML. A program that runs can always read its environment.
 *
 * So the rule is the weaker, sound one: a step given a secret must actually run
 * something capable of reading it. A body made only of `echo`, `printf`, `true`,
 * `:`, and comments is not. Steps that invoke an action (`uses:`) are exempt,
 * because an action's behaviour is not in this repository to inspect.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, ".github/workflows");

/** Read with line endings normalised: CRLF on Windows, LF on the Linux runner. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

interface WorkflowStep {
  workflow: string;
  name: string;
  /** The step's own lines, including its leading `- ` line. */
  lines: string[];
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Glob-discovered workflow files. Ordered so failures read the same every run. */
function discoverWorkflows(): string[] {
  return readdirSync(WORKFLOW_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Split a workflow into steps. `steps:` sits at some indent; its list items sit
 * two further in. Both are derived from the file rather than hardcoded, so a
 * reindented workflow is still parsed instead of silently yielding no steps.
 */
function parseSteps(workflow: string, source: string): WorkflowStep[] {
  const lines = source.split("\n");
  const steps: WorkflowStep[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*steps:\s*$/.test(lines[i])) {
      continue;
    }

    const itemIndent = indentOf(lines[i]) + 2;
    let current: string[] | null = null;

    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];

      if (isBlank(line)) {
        current?.push(line);
        continue;
      }

      // Dedented out of the steps list: this job's steps are done.
      if (indentOf(line) < itemIndent) {
        break;
      }

      if (indentOf(line) === itemIndent && line.trimStart().startsWith("- ")) {
        if (current) {
          steps.push(toStep(workflow, current));
        }
        current = [line];
        continue;
      }

      current?.push(line);
    }

    if (current) {
      steps.push(toStep(workflow, current));
    }
  }

  return steps;
}

function toStep(workflow: string, lines: string[]): WorkflowStep {
  const named = lines.map((line) => /^\s*-?\s*name:\s*(.+?)\s*$/.exec(line)).find(Boolean);
  return { workflow, name: named ? named[1] : "(unnamed step)", lines };
}

/** Env var names in this step's `env:` block whose value comes from `secrets.`. */
function secretEnvVars(step: WorkflowStep): string[] {
  const envStart = step.lines.findIndex((line) => /^\s*env:\s*$/.test(line));
  if (envStart === -1) {
    return [];
  }

  const envIndent = indentOf(step.lines[envStart]);
  const found: string[] = [];

  for (let i = envStart + 1; i < step.lines.length; i += 1) {
    const line = step.lines[i];
    if (isBlank(line)) {
      continue;
    }
    if (indentOf(line) <= envIndent) {
      break;
    }

    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*\$\{\{\s*secrets\./.exec(line);
    if (match) {
      found.push(match[1]);
    }
  }

  return found;
}

function usesAnAction(step: WorkflowStep): boolean {
  return step.lines.some((line) => /^\s*-?\s*uses:\s*\S/.test(line));
}

/** The shell body of a step's `run:`, inline or block form, comments dropped. */
function runCommands(step: WorkflowStep): string[] {
  const runIndex = step.lines.findIndex((line) => /^\s*-?\s*run:/.test(line));
  if (runIndex === -1) {
    return [];
  }

  const inline = /^\s*-?\s*run:\s*(?!\||>)(\S.*)$/.exec(step.lines[runIndex]);
  if (inline) {
    return [inline[1].trim()];
  }

  const runIndent = indentOf(step.lines[runIndex]);
  const body: string[] = [];

  for (let i = runIndex + 1; i < step.lines.length; i += 1) {
    const line = step.lines[i];
    if (isBlank(line)) {
      continue;
    }
    if (indentOf(line) <= runIndent) {
      break;
    }
    body.push(line.trim());
  }

  return body.filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Shell builtins that cannot read a secret in any useful way. Exported shape
 * kept tiny on purpose: anything not listed here counts as a real command, so
 * the guard errs towards allowing rather than towards false accusations.
 */
const NO_OP_COMMAND = /^(?:echo|printf|true)\b/;
/** `:` is the shell's null command. It gets its own pattern because `\b` after
 * a non-word character never matches a bare `:`. */
const NULL_COMMAND = /^:(?:\s|$)/;

export function runsOnlyNoOps(commands: string[]): boolean {
  return (
    commands.length > 0 &&
    commands.every((command) => NO_OP_COMMAND.test(command) || NULL_COMMAND.test(command))
  );
}

/**
 * Anchors for the blindness control. Named as (workflow, step) pairs that are
 * known to pass secrets to a real command, so a parser that stopped finding
 * `env:` blocks - or stopped finding steps at all - fails here instead of
 * reporting a clean scan of nothing.
 */
const SECRET_BEARING_ANCHORS = [
  { workflow: "deploy-pages.yml", name: "Build static site" },
  { workflow: "dev-agent-runner.yml", name: "Run dev-agent runner" },
];

const workflows = discoverWorkflows();
const allSteps = workflows.flatMap((name) => parseSteps(name, readText(path.join(WORKFLOW_DIR, name))));
const secretSteps = allSteps.filter((step) => secretEnvVars(step).length > 0);

describe("workflow steps are given only the secrets they can use", () => {
  it("discovers workflows and parses their steps (negative control for the scan)", () => {
    expect(workflows.length, ".github/workflows/ yielded no workflow files").toBeGreaterThan(0);
    expect(allSteps.length, "no steps were parsed out of any workflow").toBeGreaterThan(20);

    for (const anchor of SECRET_BEARING_ANCHORS) {
      expect(
        secretSteps.some((step) => step.workflow === anchor.workflow && step.name === anchor.name),
        `the scan did not see secrets on "${anchor.name}" in ${anchor.workflow}; either the env: ` +
          `parser is blind or that step changed, and both need a deliberate answer`,
      ).toBe(true);
    }
  });

  it("classifies no-op bodies as no-ops and real commands as real (control for the rule)", () => {
    // The whole guard turns on this predicate. If it ever answered "real" for
    // everything the scan above would still look healthy while catching nothing.
    expect(runsOnlyNoOps(['echo "Environment configured"'])).toBe(true);
    expect(runsOnlyNoOps(["true", ":"])).toBe(true);
    expect(runsOnlyNoOps(["python agents/dev-agent/runner.py"])).toBe(false);
    expect(runsOnlyNoOps(['echo "starting"', "npm run build"])).toBe(false);
    expect(runsOnlyNoOps([])).toBe(false);
  });

  it("gives no secret to a step whose body cannot read one", () => {
    const offenders = secretSteps
      .filter((step) => !usesAnAction(step) && runsOnlyNoOps(runCommands(step)))
      .map((step) => `${step.workflow} :: "${step.name}" holds ${secretEnvVars(step).join(", ")}`);

    expect(
      offenders,
      "these steps are handed secrets but run nothing that could read them, so the credentials are " +
        "decrypted into the runner for no reason:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
