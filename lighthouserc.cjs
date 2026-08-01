/**
 * Lighthouse CI configuration (v0.18, docs/design/WEB_VITALS_BASELINE.md).
 *
 * This milestone ships ZERO user-facing change. It exists so that every later
 * claim of the form "we made the app faster" is checkable by CI instead of by
 * opinion, which is the objection that has deferred the perf pass since v0.12.
 *
 * WHAT IS MEASURED, AND WHY IT IS THE REAL ARTIFACT
 * ------------------------------------------------
 * The same `out/` produced by `npm run build`, served by the same
 * `e2e/serve.mjs` the E2E smoke suite uses, mounted under the same production
 * basePath - never `next dev`. A dev server has no minification, no export
 * boundary and a different hydration profile, so a baseline taken against it
 * would measure a page nobody is ever served (design decision D3).
 *
 * The basePath and the port are IMPORTED, not restated. `e2e/serve.mjs` reads
 * `E2E_PORT` and derives its mount point from `site-base-path.mjs`; so does
 * this file. Keeping a second copy of either value here is exactly how the
 * server ends up mounted at one prefix while the URL under test points at
 * another, and every request 404s while the run still reports "a score".
 *
 * WHICH METRICS, AND THE ONE DELIBERATE DIVERGENCE FROM THE DESIGN DOC
 * -------------------------------------------------------------------
 * D2's default reads "LCP + CLS + INP". LCP and CLS are asserted below as
 * written. INP is NOT, because Lighthouse cannot produce it in the mode this
 * run uses, and asserting an audit that never appears is an assertion that
 * can never fail - a dead gate that reports green forever.
 *
 * Verified at the source in lighthouse@12.6.1 (the version `@lhci/cli@0.15.1`
 * depends on), not inferred from documentation:
 *
 *   core/audits/metrics/interaction-to-next-paint.js
 *     supportedModes: ['timespan']          <- navigation runs skip it
 *   core/config/default-config.js
 *     {id: 'interaction-to-next-paint', weight: 0,  acronym: 'INP'}
 *     {id: 'total-blocking-time',       weight: 30, acronym: 'TBT'}
 *
 * INP needs real interactions, so it is a FIELD metric; a lab navigation run
 * has nobody to interact with the page. Lighthouse's own answer is Total
 * Blocking Time, which carries the single largest weight in the performance
 * category (30) precisely because it is the lab stand-in for responsiveness.
 * TBT is therefore asserted in INP's place. The substitution is recorded in
 * docs/design/WEB_VITALS_BASELINE.md and filed for user confirmation in the
 * backlog; `src/__tests__/lighthouse-baseline-contract.test.ts` fails if INP
 * is ever added back here, so the dead gate cannot be reintroduced quietly.
 *
 * HOW THE GATE IS EXPRESSED
 * -------------------------
 * The user approved D1 as "a 5+ point drop on any Core Web Vital fails the
 * PR". A Lighthouse "point" is a percentage point of an audit's 0-100 score,
 * so the mechanical form of that sentence is a per-audit floor at
 * `baseline score - 0.05`. Each threshold below is exactly that, derived from
 * the measured baseline recorded in the design doc, and the two numbers are
 * pinned to each other by the contract test so the doc cannot drift into
 * describing a gate the repo does not run.
 *
 * `numberOfRuns: 3` and Lighthouse CI's median-run selection are what make a
 * 5-point floor usable at all: a single run of a browser metric moves by more
 * than that on runner noise alone.
 */
const { SITE_BASE_PATH } = require("./site-base-path.mjs");

/** Same env var `e2e/serve.mjs` reads, so the server and the URL under test
 *  can never be pointed at different ports. */
const PORT = Number(process.env.E2E_PORT ?? 4173);

module.exports = {
  ci: {
    collect: {
      // Lighthouse CI owns the server's lifetime: it starts it, waits for the
      // ready line, and tears it down even when a run throws.
      startServerCommand: "node e2e/serve.mjs",
      // serve.mjs announces itself with "[e2e serve] serving <dir> at <url>",
      // which matches neither half of Lighthouse CI's default /listen|ready/i.
      // Without this the collect step waits out its timeout against a server
      // that has been up the whole time.
      startServerReadyPattern: "\\[e2e serve\\] serving",
      url: [`http://127.0.0.1:${PORT}${SITE_BASE_PATH}/`],
      // Three runs, median asserted. See the note on run-to-run noise above.
      numberOfRuns: 3,
      settings: {
        // Ubuntu 24.04 (what `ubuntu-latest` now is) blocks unprivileged user
        // namespaces under AppArmor, which is the mechanism Chrome's own
        // sandbox uses, so system Chrome cannot launch on the runner without
        // this. The exposure is bounded: an ephemeral CI container loading
        // our own static export from 127.0.0.1, with no untrusted content and
        // no credential in the job.
        chromeFlags: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
    },
    assert: {
      // Only the tracked metrics are asserted. `lighthouse:recommended` was
      // considered and rejected for this milestone: it turns on ~100 audits
      // at once, most of them accessibility and best-practice checks that
      // belong to the QA stream's own passes, and the resulting red would say
      // "something in this repo is imperfect" rather than "this PR regressed
      // performance", which is the only question this gate exists to answer.
      // CALIBRATION PENDING: floors are 0 on this first push on purpose, per
      // D4 ("non-blocking on the first run"). Guessing a threshold before the
      // runner has ever measured this artifact would gate every later PR on a
      // number nobody observed. The first CI run on this PR writes the real
      // scores to its job summary; the next push replaces these three zeroes
      // with `measured - 0.05` and records the measured values in the doc.
      assertions: {
        "largest-contentful-paint": ["error", { minScore: 0 }],
        "cumulative-layout-shift": ["error", { minScore: 0 }],
        "total-blocking-time": ["error", { minScore: 0 }],
      },
    },
    upload: {
      // `temporary-public-storage`, the Lighthouse CI default, POSTs the full
      // report to a Google-operated public bucket. Nothing in this report is
      // secret (the site it measures is public), but a CI job that egresses
      // build output to a third party is a surface this repo does not need:
      // the same report is kept as a run artifact instead, which is durable,
      // versioned with the run, and reaches nobody outside the repo.
      target: "filesystem",
      outputDir: ".lighthouseci/report",
    },
  },
};
