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

/**
 * The basePath escaped for use inside a RegExp source string. Lighthouse CI
 * routes each collected report to an `assertMatrix` entry via
 * `new RegExp(matchingUrlPattern).test(lhr.finalUrl)` (verified in
 * `@lhci/utils@0.15.1` `src/assertions.js`, not inferred from docs), so the
 * patterns below are regexes, and a basePath containing a regex
 * metacharacter would silently change what they match. Derived from
 * SITE_BASE_PATH for the same reason the URLs are: a hardcoded slug here
 * would have broken on the 2026-07-29 repo rename.
 */
const BASE_PATH_PATTERN = SITE_BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
      // The entry route and the revenue route (v0.20 PR2). `/pricing/` is
      // where a person who decides to pay actually lands, and before this a
      // regression isolated to it was invisible to the gate. Each extra URL
      // costs three Lighthouse runs per PR, which is why the roadmap scopes
      // this list to exactly these two; `/journal/` and `/trends/` stay in
      // the follow-up queue until a regression risk there is worth that
      // price.
      url: [
        `http://127.0.0.1:${PORT}${SITE_BASE_PATH}/`,
        `http://127.0.0.1:${PORT}${SITE_BASE_PATH}/pricing/`,
      ],
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
      // Every number below is measured, none is aspirational, and section 7 of
      // the design doc holds the same values for every measured URL (the
      // contract test fails if the two ever disagree, or if a measured URL
      // has no documented numbers).
      //
      // Lighthouse CI aggregates with `optimistic` by default, so each
      // assertion is really "the BEST of the three runs must clear this".
      // That is the right default for browser timings, and the thresholds
      // below are set against the worst BEST-OF-RUN seen across two
      // independent three-run invocations, not against a single median.
      //
      // WHY TWO OF THESE CARRY A NUMERIC CEILING AS WELL AS A SCORE FLOOR
      // ----------------------------------------------------------------
      // D1's approved form is "a 5+ point drop fails", i.e. a floor at
      // `measured - 0.05`. That works only while the score has room to fall.
      // This app's first measurement came in at LCP 0.07 and CLS 0.06, so the
      // literal floors would be 0.02 and 0.00 - and a floor of 0.00 cannot
      // fail, because a score is never negative. Shipping that would be a
      // dead gate reporting green forever, which is the exact thing the INP
      // assertion was rejected for a few lines above. Rejecting it there and
      // accepting it here would be the same mistake wearing a different hat.
      //
      // Lighthouse scores are a saturating curve over the raw value: once a
      // metric is deep in the red, a large real regression barely moves the
      // score. So for a saturated metric the regression signal is the
      // RAW VALUE, and its ceiling sits just above the worst measured run.
      // `minScore` is kept alongside where it is live because it is D1's
      // approved form and it starts biting again the moment the metric
      // improves - which is what v0.19's perf pass was for.
      //
      // AND WHY TOTAL BLOCKING TIME GETS NO SCORE FLOOR AT ALL
      // ------------------------------------------------------
      // The first calibration of this gate put TBT at `minScore: 0.9`, its
      // measured 0.96 minus D1's five points, and the very next run went red
      // on it: run 30707624249 reported "expected >=0.9, found 0.89", with
      // per-run values of 0.24, 0.87, 0.89 - on an unchanged artifact.
      //
      // That red is kept as evidence rather than argued away. TBT measures
      // main-thread blocking, so on a shared CI runner it is really measuring
      // what else that host happens to be doing: across the two runs its
      // best-of-three score moved 0.96 -> 0.89 and its best-of-three value
      // moved 128 ms -> 204 ms, with one sample as bad as 1092 ms, all with no
      // code change. A five-point tolerance is inside that noise, so a score
      // floor there would fail honest PRs at random - and a gate that cries
      // wolf is worse than no gate, because people learn to merge through red.
      //
      // So TBT is gated on its raw value with real headroom instead. D1's
      // five-point form is simply not viable for this metric on this
      // infrastructure; that is a finding about the runner, not a softening of
      // the decision, and it is filed for the user in the backlog.
      //
      // WHY assertMatrix RATHER THAN A SINGLE assertions BLOCK (v0.20 PR2)
      // ------------------------------------------------------------------
      // With two URLs measured, one shared assertions block would hold both
      // routes to one set of numbers, so the tighter route's calibration
      // would either fail the other or be loosened to cover it. assertMatrix
      // gives each URL its own measured thresholds. Two facts about how the
      // tool routes reports, both verified in `@lhci/utils@0.15.1` source
      // rather than assumed: `assertMatrix` cannot coexist with a top-level
      // `assertions` block (the tool throws), and a report whose URL matches
      // NO entry is asserted by NOTHING, silently - which is why the
      // contract test proves every measured URL matches exactly one entry
      // and every entry exactly one URL.
      assertMatrix: [
        {
          // The entry route `/`. Anchored on the basePath so it cannot also
          // match `/pricing/` (a pattern is a regex over the full URL, and
          // an unanchored one matches every route under the site).
          matchingUrlPattern: `${BASE_PATH_PATTERN}/$`,
          assertions: {
            // RECALIBRATED by v0.20 PR1 (docs/ROADMAP.md v0.20), which made
            // `e2e/serve.mjs` serve gzip the way GitHub Pages does. Was
            // `{ minScore: 0.13, maxNumericValue: 6500 }`, calibrated against the
            // identity-serving harness (worst best-of-run 5547 ms) - a ceiling
            // that would have defended nothing over the ~2.7 s page a visitor is
            // actually served. Measured on THIS PR's own runs by the established
            // method, two independent three-run invocations of the same pinned
            // lighthouse (run 31167698390, attempts 1 and 2):
            //
            //   attempt 1:  3122, 2683, 2733 ms  -> best 2683 (score 0.86)
            //   attempt 2:  3438, 2710, 2683 ms  -> best 2683 (score 0.86)
            //
            // The first sample of each is the usual cold-start outlier that
            // `optimistic` aggregation absorbs; the four warm samples span 50 ms.
            // This matches PR #143's controlled A/B (2685-2700 ms gzip-served)
            // within noise, which is the receipt that the D7 attribution was
            // right. Floor: worst best-of-run 0.86 minus D1's five points = 0.81.
            // Ceiling: worst best-of-run 2683 ms plus ~19% headroom = 3200 ms,
            // the same margin discipline the 6500 (over 5547) and 8000 (over
            // 6757) ceilings carried, and comfortably under the 4000 ms bound
            // the v0.20 done-when demands. Both halves TIGHTEN; nothing loosened.
            //
            // The superseded v0.19 PR2 calibration below is kept as history.
            // RATCHETED by v0.19 PR2 (docs/design/PERF_PASS.md D3). Was
            // `{ minScore: 0.02, maxNumericValue: 8000 }`, calibrated against a
            // best-of-run 6757 ms measured in both baseline runs.
            //
            // PR #140 took zod off the entry route. Calibrated the same way the
            // original baseline was — against the WORST best-of-run across two
            // independent runs on this PR, not against one flattering sample:
            //
            //   run 30715170249:  11851, 5403, 5535 ms  -> best 5403 (score 0.20)
            //   run 30715529983:   8984, 5558, 5547 ms  -> best 5547 (score 0.18)
            //
            // The first sample of each is a cold-start outlier of the kind
            // `optimistic` aggregation exists to absorb; the warm samples sit
            // within 155 ms of each other across both runs.
            //
            // LCP has left the saturated region, so D1's five-point floor does real
            // work again: worst best-of-run 0.18 - 0.05 = 0.13, and that is the
            // BINDING half. A floor of 0.15 was measured first (0.20 - 0.05, from
            // the first run alone) and DELIBERATELY LOOSENED to 0.13 before merge
            // when the second run came in at 0.18: three points of headroom on a
            // browser timing is inside the noise this file already documents for
            // TBT, and a gate that cries wolf is worse than no gate.
            //
            // The ceiling drops 8000 -> 6500: the worst best-of-run 5547 plus ~17%
            // headroom, close to the ~18% the old 8000 carried over 6757. It is the
            // looser half, kept as the backstop for an upstream scoring-curve
            // change. If this floor still proves noisy the remedy is
            // `numberOfRuns: 5`, never a looser threshold.
            "largest-contentful-paint": [
              "error",
              { minScore: 0.81, maxNumericValue: 3200 },
            ],
            // CONFIRMED (not assumed) by v0.20 PR1's recalibration: CLS measured
            // 0.000 with score 1.00 in all six samples across both invocations of
            // run 31167698390 under the gzip-serving harness - transfer encoding
            // does not move layout, so both halves hold unchanged.
            // RATCHETED by v0.19 PR1 (docs/design/PERF_PASS.md D3: a win the gate
            // does not defend decays back). Was `{ minScore: 0, maxNumericValue:
            // 0.8 }`, calibrated against 0.752 measured in all six baseline runs.
            // PR #139 took the first-run panel out of normal flow and CLS measured
            // 0.000 with score 1.00 in ALL THREE runs of run 30713366106, with
            // `layout-shifts` reporting zero shift entries - not a smaller shift, no
            // shift.
            //
            // So the score floor is live again for the first time: 1.00 minus D1's
            // five points is 0.95, which is roughly a raw CLS of 0.05 and is now
            // the binding half of this assertion. The ceiling stays at D2's target
            // of 0.10, the Core Web Vitals "good" boundary, as the backstop for the
            // case a future Lighthouse moves the scoring curve under us. A ceiling
            // of exactly 0.0 was rejected: it would fail an honest PR over a 0.001
            // shift, and this gate's credibility is why TBT lost its score floor.
            "cumulative-layout-shift": [
              "error",
              { minScore: 0.95, maxNumericValue: 0.1 },
            ],
            // Best-of-run 128 ms then 204 ms. Ceiling at 500 ms: ~2.5x the worse
            // of the two, which still catches a real regression while sitting well
            // clear of the observed noise. No `minScore` on purpose - see above.
            //
            // RE-DERIVED (and deliberately kept at 500) by v0.20 PR1: the gzip
            // runs measured best-of-run 72 ms then 70 ms - compression barely
            // moved the CPU work, as expected - but this metric's own history on
            // an unchanged artifact spans best-of-run 70 to 204 ms, so a ceiling
            // derived from today's two low samples (~2.5x 72 = 180 ms) would sit
            // inside the documented cross-run spread and cry wolf. 500 ms remains
            // ~2.5x the WORST best-of-run ever observed here (204 ms), which is
            // the derivation that respects the noise record rather than the lucky
            // day. If it ever proves loose, the remedy is `numberOfRuns: 5`.
            "total-blocking-time": ["error", { maxNumericValue: 500 }],
          },
        },
        {
          // The revenue route `/pricing/` (v0.20 PR2): where a person who
          // decides to pay actually lands. PROVISIONAL: the thresholds below
          // are the entry route's calibrated values carried over as the
          // starting point so this PR's own Web Vitals runs can measure the
          // route; the calibration commit on this same PR replaces this
          // comment and the numbers with values derived by the established
          // method (worst best-of-run across two independent three-run
          // invocations, named by run id) before merge. The doc-parity
          // contract test holds section 7 of WEB_VITALS_BASELINE.md to these
          // exact values at every commit either way.
          matchingUrlPattern: `${BASE_PATH_PATTERN}/pricing/$`,
          assertions: {
            "largest-contentful-paint": [
              "error",
              { minScore: 0.81, maxNumericValue: 3200 },
            ],
            "cumulative-layout-shift": [
              "error",
              { minScore: 0.95, maxNumericValue: 0.1 },
            ],
            "total-blocking-time": ["error", { maxNumericValue: 500 }],
          },
        },
      ],
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
