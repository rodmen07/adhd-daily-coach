/**
 * Contract guard for the Web Vitals gate (v0.18,
 * docs/design/WEB_VITALS_BASELINE.md).
 *
 * The gate is three numbers in `lighthouserc.cjs` that are only meaningful
 * next to the measured baseline written down in the design doc. Nothing else
 * in the repo compares them, and every failure mode of this gate is silent:
 *
 *   - a threshold is loosened and the doc still advertises the old baseline,
 *     so the file says the app is fast while the gate would let it halve;
 *   - `interaction-to-next-paint` is added back to satisfy D2's literal
 *     wording, and because Lighthouse only produces that audit in timespan
 *     mode, the assertion never evaluates and never fails - a gate that
 *     reports green about a metric it has never once measured;
 *   - the URL under test is hardcoded, drifts from `site-base-path.mjs` after
 *     the next rename, and every request 404s while the run still returns a
 *     score for the 404 page;
 *   - the pinned Lighthouse version floats, and a new scoring curve upstream
 *     arrives looking exactly like a code regression.
 *
 * So this test reads the real config, the real workflow and the real doc,
 * rather than restating any of them.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RC_PATH = path.join(ROOT, "lighthouserc.cjs");
const WORKFLOW_PATH = path.join(ROOT, ".github/workflows/lighthouse.yml");
const DOC_PATH = path.join(ROOT, "docs/design/WEB_VITALS_BASELINE.md");

/** Read with line endings normalised: this repo is checked out with
 *  `core.autocrlf=true` on Windows and LF on the Linux runner, so every
 *  regex below must see the same text in both. */
function read(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/** Load the config the way Lighthouse CI does - real Node `require`, so the
 *  `require("./site-base-path.mjs")` inside it resolves for real instead of
 *  through the test runner's module transform. A config that only loads under
 *  vitest is not the config CI runs. */
const rc = createRequire(import.meta.url)("../../lighthouserc.cjs") as {
  ci: {
    collect: { url: string[]; numberOfRuns: number; startServerReadyPattern: string };
    assert: { assertions: Record<string, [string, { minScore?: number }]> };
    upload: { target: string };
  };
};

/** The metrics the gate is allowed to assert on. TBT stands in for INP, which
 *  Lighthouse cannot produce in navigation mode; see lighthouserc.cjs. */
const TRACKED = [
  "largest-contentful-paint",
  "cumulative-layout-shift",
  "total-blocking-time",
];

describe("web vitals gate contract", () => {
  it("asserts exactly the three tracked metrics, each as a hard error", () => {
    const assertions = rc.ci.assert.assertions;
    expect(Object.keys(assertions).sort()).toEqual([...TRACKED].sort());

    for (const metric of TRACKED) {
      const [level, options] = assertions[metric];
      // "warn" would keep the job green while printing a complaint nobody
      // reads, which is the difference between a gate and a decoration.
      expect(level, `${metric} must fail the run, not warn`).toBe("error");
      expect(typeof options.minScore, `${metric} needs a score floor`).toBe("number");
    }
  });

  it("never gates on interaction-to-next-paint, which navigation runs cannot produce", () => {
    // lighthouse@12.6.1: core/audits/metrics/interaction-to-next-paint.js
    // declares `supportedModes: ['timespan']`, and default-config.js gives it
    // `weight: 0`. Asserting it here would add an assertion that can never
    // fire. If INP ever becomes measurable in this mode, delete this test in
    // the same change that adds the assertion - do not weaken it.
    expect(Object.keys(rc.ci.assert.assertions)).not.toContain(
      "interaction-to-next-paint",
    );
  });

  it("derives the measured URL from site-base-path.mjs instead of hardcoding it", () => {
    const source = read(RC_PATH);
    expect(source).toContain('require("./site-base-path.mjs")');

    // The repo was renamed once already (calm-daily-coach -> adhd-daily-coach,
    // 2026-07-29). A literal slug here would have survived that rename as a
    // URL pointing at a prefix serve.mjs no longer mounts.
    const assignments = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
    expect(assignments.join("\n")).not.toMatch(/["'`]\/(adhd|calm)-daily-coach/);

    expect(rc.ci.collect.url).toHaveLength(1);
    expect(rc.ci.collect.url[0]).toContain("/adhd-daily-coach/");
  });

  it("waits for the ready line e2e/serve.mjs actually prints", () => {
    // Lighthouse CI's default ready pattern is /listen|ready/i, and serve.mjs
    // prints neither word. A mismatched pattern does not fail loudly: collect
    // sits out its timeout while the server is up and healthy the whole time.
    const serveSource = read(path.join(ROOT, "e2e/serve.mjs"));
    const readyLine = serveSource.match(/console\.log\(`(\[e2e serve\][^`]*)`/);
    expect(readyLine, "e2e/serve.mjs no longer prints a recognisable ready line").not.toBeNull();
    expect(readyLine![1]).toMatch(new RegExp(rc.ci.collect.startServerReadyPattern));
  });

  it("keeps more than one run so a single noisy sample cannot fail the gate", () => {
    // A 5-point floor is below the run-to-run spread of a single browser
    // timing run, so the median of several is what makes the threshold usable.
    expect(rc.ci.collect.numberOfRuns).toBeGreaterThanOrEqual(3);
  });

  it("keeps the report in the repo rather than uploading it to a third party", () => {
    // Lighthouse CI's default target POSTs the report to a Google-operated
    // public bucket. The workflow keeps it as a run artifact instead.
    expect(rc.ci.upload.target).toBe("filesystem");
    expect(read(WORKFLOW_PATH)).toContain("actions/upload-artifact@v7");
  });

  it("pins Lighthouse CI to an exact version", () => {
    const workflow = read(WORKFLOW_PATH);
    const pin = workflow.match(/@lhci\/cli@(\S+)/);
    expect(pin, "the workflow must install a pinned @lhci/cli").not.toBeNull();
    // No `^`, `~` or `latest`: a new minor can move a scoring curve upstream,
    // which arrives looking exactly like a regression this repo caused.
    expect(pin![1]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("stays out of the required-check list it is not ready to join", () => {
    // Decision D4: this job is observational until the baseline proves
    // stable. Branch protection is not readable from a test, so what is
    // guarded here is the claim in the workflow that a reader relies on.
    const workflow = read(WORKFLOW_PATH);
    expect(workflow).toContain("NOT a required branch-protection context");
  });

  it("documents the same baseline the gate is calibrated against", () => {
    // The doc's table is where a person looks up "how fast is this app".
    // If it can drift from the floors below, it becomes decoration.
    const doc = read(DOC_PATH);
    for (const metric of TRACKED) {
      const floor = rc.ci.assert.assertions[metric][1].minScore as number;
      expect(
        doc,
        `docs/design/WEB_VITALS_BASELINE.md must record the ${metric} floor of ${floor.toFixed(2)}`,
      ).toContain(`\`${metric}\` | ${floor.toFixed(2)}`);
    }
  });
});
