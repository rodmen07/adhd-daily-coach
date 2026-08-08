/**
 * Contract guard for the Web Vitals gate (v0.18,
 * docs/design/WEB_VITALS_BASELINE.md; widened to per-URL assertions by
 * v0.20 PR2).
 *
 * The gate is a handful of numbers in `lighthouserc.cjs` that are only
 * meaningful next to the measured baseline written down in the design doc.
 * Nothing else in the repo compares them, and every failure mode of this gate
 * is silent:
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
 *   - a URL is added to `collect.url` without an `assertMatrix` entry whose
 *     pattern matches it, and Lighthouse CI measures it while asserting
 *     NOTHING about it (verified in `@lhci/utils@0.15.1` source: a report
 *     matched by no entry is simply skipped) - three runs of cost per PR for
 *     zero protection, reporting green forever;
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

// The same single source of truth the config derives its URLs from, so the
// route names computed below can never drift from the served basePath.
import { SITE_BASE_PATH } from "../../site-base-path.mjs";

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

interface AssertionOptions {
  minScore?: number;
  maxNumericValue?: number;
}

interface MatrixEntry {
  matchingUrlPattern: string;
  assertions: Record<string, [string, AssertionOptions]>;
}

/** Load the config the way Lighthouse CI does - real Node `require`, so the
 *  `require("./site-base-path.mjs")` inside it resolves for real instead of
 *  through the test runner's module transform. A config that only loads under
 *  vitest is not the config CI runs. */
const rc = createRequire(import.meta.url)("../../lighthouserc.cjs") as {
  ci: {
    collect: { url: string[]; numberOfRuns: number; startServerReadyPattern: string };
    assert: { assertMatrix: MatrixEntry[] };
    upload: { target: string };
  };
};

/**
 * The route a URL serves under the site's basePath: "/" for the entry route,
 * "/pricing/" for the revenue route. This is the label the design doc's
 * baseline table keys its rows on, derived from the same `SITE_BASE_PATH`
 * the config builds the URL from.
 */
function routeOf(url: string): string {
  const pathname = new URL(url).pathname;
  expect(
    pathname.startsWith(`${SITE_BASE_PATH}/`),
    `${url} is not under the production basePath ${SITE_BASE_PATH}`,
  ).toBe(true);
  return pathname.slice(SITE_BASE_PATH.length);
}

/** The matrix entry whose pattern matches this URL, applied exactly the way
 *  Lighthouse CI applies it: `new RegExp(pattern).test(url)`. */
function entriesMatching(url: string): MatrixEntry[] {
  return rc.ci.assert.assertMatrix.filter((entry) =>
    new RegExp(entry.matchingUrlPattern).test(url),
  );
}

/**
 * Below this, a Lighthouse score is on the saturated part of its curve: the
 * metric is already deep in the red, and a large real regression moves the
 * score by less than the gate's own tolerance. A floor down there is not a
 * gate, it is a decoration - and a floor of exactly 0 cannot fail at all,
 * since a score is never negative.
 */
const SATURATED_SCORE = 0.1;

/** The metrics the gate is allowed to assert on. TBT stands in for INP, which
 *  Lighthouse cannot produce in navigation mode; see lighthouserc.cjs. */
const TRACKED = [
  "largest-contentful-paint",
  "cumulative-layout-shift",
  "total-blocking-time",
];

describe("web vitals gate contract", () => {
  it("measures the entry route and the revenue route", () => {
    // v0.20 PR2: a regression isolated to /pricing/ - the page a person who
    // decides to pay actually lands on - was invisible to a gate that only
    // measured /. The roadmap deliberately scopes the list to exactly these
    // two (each extra URL costs three Lighthouse runs per PR), so growth is
    // a decision that must land here too, not drift.
    expect(rc.ci.collect.url.map(routeOf).sort()).toEqual(["/", "/pricing/"]);
  });

  it("matches every measured URL to exactly one assertion set, and every assertion set to exactly one measured URL", () => {
    // Both silent failure modes of assertMatrix, guarded in both directions
    // (verified against @lhci/utils@0.15.1 source, not assumed):
    //   - a measured URL matched by NO entry is collected and then asserted
    //     by nothing, so the gate spends three runs to protect it from
    //     nothing and reports green forever;
    //   - a measured URL matched by TWO entries is held to both sets, so one
    //     of them is an accident;
    //   - an entry matching no measured URL is a dead gate that looks alive.
    for (const url of rc.ci.collect.url) {
      const matching = entriesMatching(url);
      expect(
        matching.map((entry) => entry.matchingUrlPattern),
        `${url} must be matched by exactly one assertMatrix entry, ` +
          `or the gate measures it while asserting nothing about it`,
      ).toHaveLength(1);
    }

    for (const entry of rc.ci.assert.assertMatrix) {
      const matched = rc.ci.collect.url.filter((url) =>
        new RegExp(entry.matchingUrlPattern).test(url),
      );
      expect(
        matched,
        `assertMatrix entry ${entry.matchingUrlPattern} must match exactly one ` +
          `measured URL; matching none makes it a dead gate`,
      ).toHaveLength(1);
    }
  });

  it("asserts exactly the three tracked metrics for every measured URL, each as a hard error", () => {
    for (const entry of rc.ci.assert.assertMatrix) {
      expect(
        Object.keys(entry.assertions).sort(),
        `entry ${entry.matchingUrlPattern}`,
      ).toEqual([...TRACKED].sort());

      for (const metric of TRACKED) {
        const [level, options] = entry.assertions[metric];
        // "warn" would keep the job green while printing a complaint nobody
        // reads, which is the difference between a gate and a decoration.
        expect(
          level,
          `${metric} (${entry.matchingUrlPattern}) must fail the run, not warn`,
        ).toBe("error");
        // At least one predicate, of either kind. Which kind is right depends
        // on the metric - see the saturation and noise notes in
        // lighthouserc.cjs - but an assertion carrying neither would assert
        // nothing at all. That is not hypothetical: with no predicate,
        // Lighthouse CI silently substitutes a default `minScore` of 0.9, so
        // an empty options object enforces a threshold nobody in this repo
        // chose.
        expect(
          options.minScore !== undefined || options.maxNumericValue !== undefined,
          `${metric} (${entry.matchingUrlPattern}) carries no threshold at all`,
        ).toBe(true);
      }
    }
  });

  it("never gates a metric only by a predicate that cannot fail", () => {
    // The generalisation of the INP rule below, learned from this repo's own
    // first measurement: LCP came in at 0.07 and CLS at 0.06, so D1's literal
    // `measured - 0.05` floors would have been 0.02 and 0.00. A floor of 0.00
    // can never fail. Rejecting a dead assertion for INP and then shipping one
    // for CLS would be the same mistake wearing a different hat.
    //
    // A saturated score is allowed ONLY when a raw-value ceiling is carrying
    // the gate, because once a metric is deep in the red the raw value is the
    // only thing that still moves usefully.
    for (const entry of rc.ci.assert.assertMatrix) {
      for (const [metric, [, options]] of Object.entries(entry.assertions)) {
        const live =
          (options.minScore ?? 0) >= SATURATED_SCORE ||
          options.maxNumericValue !== undefined;
        expect(
          live,
          `${metric} (${entry.matchingUrlPattern}) is gated only by minScore ` +
            `${options.minScore}, which is on the saturated part of the score ` +
            `curve; give it a maxNumericValue ceiling or the gate cannot ` +
            `detect a regression in it`,
        ).toBe(true);
      }
    }
  });

  it("never gates on interaction-to-next-paint, which navigation runs cannot produce", () => {
    // lighthouse@12.6.1: core/audits/metrics/interaction-to-next-paint.js
    // declares `supportedModes: ['timespan']`, and default-config.js gives it
    // `weight: 0`. Asserting it here would add an assertion that can never
    // fire. If INP ever becomes measurable in this mode, delete this test in
    // the same change that adds the assertion - do not weaken it.
    for (const entry of rc.ci.assert.assertMatrix) {
      expect(Object.keys(entry.assertions)).not.toContain(
        "interaction-to-next-paint",
      );
    }
  });

  it("derives the measured URLs from site-base-path.mjs instead of hardcoding them", () => {
    const source = read(RC_PATH);
    expect(source).toContain('require("./site-base-path.mjs")');

    // The repo was renamed once already (calm-daily-coach -> adhd-daily-coach,
    // 2026-07-29). A literal slug here would have survived that rename as a
    // URL pointing at a prefix serve.mjs no longer mounts.
    const assignments = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
    expect(assignments.join("\n")).not.toMatch(/["'`]\/(adhd|calm)-daily-coach/);

    for (const url of rc.ci.collect.url) {
      expect(url).toContain(`${SITE_BASE_PATH}/`);
    }
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

  it("says in the workflow itself that it is now a required check", () => {
    // Decision D4 shipped this job observational until the baseline proved
    // stable; it did (58 runs, one failure, that one pre-merge on the branch
    // that introduced the workflow), and PR #161 promoted it on 2026-08-08.
    //
    // This assertion used to read `expect(workflow).toContain("NOT a required
    // branch-protection context")`, and it is what caught the promotion:
    // flipping requiredness reddened this suite instead of quietly leaving a
    // workflow header that told the next reader the opposite of the truth.
    // Branch protection is still not readable from an offline test, so what is
    // guarded here is still the claim in the workflow that a reader relies on -
    // only now it is the claim that the job DOES gate merges.
    const workflow = read(WORKFLOW_PATH);
    expect(workflow).toContain("THIS IS A REQUIRED BRANCH-PROTECTION CONTEXT");
    expect(
      workflow,
      "the workflow no longer points at the declared contract, so the two can drift",
    ).toContain(".github/required-checks.json");
  });

  it("keeps its pull_request trigger unconditional, because it is required", () => {
    // The property that makes requiredness safe rather than a repo-wide wedge.
    // A `paths:` filter here would mean a PR touching nothing that matches
    // never receives the `lighthouse` check, and branch protection would then
    // block that PR with no way out except an admin changing the setting.
    // `required-checks-contract.test.ts` enforces this across every required
    // context; it is restated here because this file is what somebody edits
    // when they want to make the Web Vitals job cheaper.
    const workflow = read(WORKFLOW_PATH);
    const onBlock = workflow.slice(workflow.indexOf("\non:"));
    const prTrigger = onBlock.slice(0, onBlock.indexOf("\npermissions:"));
    expect(prTrigger, "lighthouse.yml no longer runs on pull_request at all").toContain("pull_request:");
    expect(/^\s+paths(-ignore)?:/m.test(prTrigger), "lighthouse.yml's triggers grew a paths filter while it is a required context").toBe(
      false,
    );
  });

  it("documents the same thresholds the gate is calibrated against, for every measured URL", () => {
    // The doc's table is where a person looks up "how fast is this app" and
    // "what would fail". If it can drift from the enforced numbers, it is
    // decoration - and this repo's most persistent defect class is prose that
    // asserts a state the code contradicts. Since v0.20 PR2 the gate measures
    // more than one URL, so the parity is per URL: a measured URL with no
    // documented numbers fails here, which is what keeps "the gate widened"
    // and "the doc describes the gate" the same fact.
    const doc = read(DOC_PATH);
    for (const url of rc.ci.collect.url) {
      const route = routeOf(url);
      const [entry] = entriesMatching(url);
      expect(entry, `${url} has no assertMatrix entry to document`).toBeDefined();

      for (const metric of TRACKED) {
        const options = entry.assertions[metric][1];
        const floor = options.minScore === undefined ? "—" : options.minScore.toFixed(2);
        const ceiling =
          options.maxNumericValue === undefined ? "—" : String(options.maxNumericValue);
        expect(
          doc,
          `docs/design/WEB_VITALS_BASELINE.md must carry a row reading ` +
            `\`${route}\` | \`${metric}\` | ${floor} | ${ceiling}`,
        ).toContain(`\`${route}\` | \`${metric}\` | ${floor} | ${ceiling}`);
      }
    }
  });
});
