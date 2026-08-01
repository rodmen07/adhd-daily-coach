/**
 * Turns a Lighthouse CI run into the two things a human actually needs from
 * it (v0.18, docs/design/WEB_VITALS_BASELINE.md):
 *
 *   1. the measured Core Web Vitals of the run, as a table, and
 *   2. the exact `minScore` floors those measurements imply under decision D1
 *      ("a 5+ point drop on any Core Web Vital fails the PR"),
 *
 * printed as markdown on stdout so the workflow can append it to
 * `$GITHUB_STEP_SUMMARY`. Without this the baseline lives only inside a
 * 3 MB JSON blob in an artifact, and "calibrate the gate" becomes a manual
 * scavenger hunt that nobody repeats correctly the second time.
 *
 * It reads the run rather than restating it: every number below comes out of
 * the Lighthouse report the `collect` step just produced. It deliberately
 * never fails the job - the gate is the `lhci assert` step, and a reporting
 * script that can turn a green run red is a second, accidental gate.
 *
 * Deliberately dependency-free (Node stdlib only), for the same reason
 * `e2e/serve.mjs` is: CI-only tooling should not widen the tree that the
 * blocking `npm audit` step has to keep clean.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** Written by `lhci upload --target=filesystem`; see lighthouserc.cjs. */
const MANIFEST = path.join(process.cwd(), ".lighthouseci", "report", "manifest.json");

/** The metrics this repo gates on. `total-blocking-time` stands in for INP,
 *  which Lighthouse only produces in timespan mode - see lighthouserc.cjs. */
const TRACKED = [
  { id: "largest-contentful-paint", label: "Largest Contentful Paint", acronym: "LCP" },
  { id: "cumulative-layout-shift", label: "Cumulative Layout Shift", acronym: "CLS" },
  { id: "total-blocking-time", label: "Total Blocking Time", acronym: "TBT (INP proxy)" },
];

/** D1's approved threshold, as a fraction of the 0-1 audit score. */
const REGRESSION_ALLOWANCE = 0.05;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

function out(line = "") {
  process.stdout.write(`${line}\n`);
}

let manifest;
try {
  manifest = readJson(MANIFEST);
} catch (error) {
  // The collect step failed, or failed before writing any report. Say so
  // plainly instead of printing an empty table that reads like a clean run.
  out("### Web Vitals");
  out();
  out(`No Lighthouse report was produced (\`${path.relative(process.cwd(), MANIFEST)}\`: ${error.code ?? error.message}).`);
  process.exit(0);
}

// Lighthouse CI runs the page N times and marks ONE entry per URL as the
// representative (median) run. Asserting and reporting must agree on which
// run that is, so read the flag rather than picking the first or the best.
const representative = manifest.filter((entry) => entry.isRepresentativeRun);
const entries = representative.length > 0 ? representative : manifest;

out("### Web Vitals");
out();

for (const entry of entries) {
  const lhr = readJson(entry.jsonPath);
  const category = lhr.categories?.performance?.score;

  out(`**${entry.url}** — performance ${category === null || category === undefined ? "n/a" : Math.round(category * 100)}`);
  out();
  out("| Metric | Measured | Score | Gate floor (score − 5) |");
  out("| --- | --- | --- | --- |");

  const floors = {};
  for (const metric of TRACKED) {
    const audit = lhr.audits?.[metric.id];
    if (!audit || audit.score === null || audit.score === undefined) {
      // An audit that produces no score cannot be gated on; saying so is the
      // whole reason INP is not in this list.
      out(`| ${metric.label} (${metric.acronym}) | not applicable | — | — |`);
      continue;
    }
    // Floors are truncated DOWNWARD to whole points, never rounded up: a
    // rounded-up floor can sit above the very run it was derived from and
    // fail the next green PR for no reason.
    const floor = Math.max(0, Math.floor((audit.score - REGRESSION_ALLOWANCE) * 100) / 100);
    floors[metric.id] = floor;
    out(
      `| ${metric.label} (${metric.acronym}) | ${audit.displayValue ?? audit.numericValue} | ` +
        `${Math.round(audit.score * 100)} | ${floor.toFixed(2)} |`,
    );
  }

  out();
  out("<details><summary>Calibrated <code>minScore</code> floors for lighthouserc.cjs</summary>");
  out();
  out("```json");
  out(JSON.stringify(floors, null, 2));
  out("```");
  out();
  out("</details>");
  out();
}
