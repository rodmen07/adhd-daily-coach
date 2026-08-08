# Web Vitals Baseline: Measure, then optimize

Status: **SHIPPED 2026-08-01 as v0.18 PR1.** D1 was approved by the user on
2026-08-01 as its default (a 5+ point drop on any tracked Core Web Vital fails
the PR). D2 ships with one substitution forced by what Lighthouse can actually
measure, recorded in section 6; every other default shipped as written.

The gate is `.github/workflows/lighthouse.yml` plus `lighthouserc.cjs`, and the
measured baseline it is calibrated against is in section 7.

## 0. Executive summary

Establish a **repeatable, CI-checkable measurement baseline** for performance across the deployed Pages artifact. This milestone adds **zero user-facing features** — it is pure instrumentation that makes every future "perf pass" milestone **CI-verifiable** instead of "faster but unmeasured."

**Why now:** The perf pass has been the standing runner-up since v0.12, deferred with the objection "no web-vitals baseline exists, so 'faster' is not CI-checkable." That objection is self-curing: the act of establishing the baseline IS the natural PR1 of any future perf milestone. Establishing it now removes the blocker and makes every statement "we optimized X" **checkable by CI**, not just by manual inspection.

## 1. Scope

### In scope

- Add **Lighthouse CI** (a free GitHub Action) to the deploy workflow, reporting Core Web Vitals on every PR and main push
- Establish a **baseline budget** (pass/fail thresholds) based on the current Pages artifact's measured scores
- New `docs/WEB_VITALS_BASELINE.md` capturing the measured values (this file, to be filled in after the first run)
- A single **required guardrail**: if a PR **introduces a regression** of more than 5 points on **any Core Web Vital**, the suite fails and gates the merge (the exact threshold chosen by the user, overridable via D1 below)

### Out of scope

- **No actual optimizations in this milestone** (those belong in future "Perf Pass" milestones)
- No bundle analysis, no code-split analysis, no dependency audit extensions
- No customer-facing SLO or uptime commitments (Pages handles availability, not us)
- No Firebase SDK load profiling (that's a future optimization, not a measurement tool)

## 2. Design decisions

**D1 (overridable): baseline threshold + regression gate. APPROVED 2026-08-01 as the default.**

- **Default:** establish a "regression means 5+ point drop on any Core Web Vital" gate that **fails the PR** and prevents merge.
- **Alternative A:** softer gate — regression is advisory, emits a comment/annotation but does not block.
- **Alternative B:** no gate at all — baseline is for information only, no CI enforcement.

*As shipped:* a Lighthouse "point" is a percentage point of an audit's 0–1
score, so "5+ point drop" is expressed as a per-audit `minScore` floor at
`measured baseline − 0.05`. The job fails when any tracked metric falls below
its floor. Merge-blocking in the branch-protection sense is held one release
back on purpose — see D4.

**D2 (overridable): which Core Web Vitals to track. SHIPPED WITH ONE SUBSTITUTION — see section 6.**

- **Default:** Lighthouse's three main metrics: Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), Interaction to Next Paint (INP).
- **Alternative A:** add additional metrics (First Contentful Paint, Time to First Byte, Performance score).
- **Alternative B:** track only LCP (the most critical to perceived performance).

*As shipped:* LCP and CLS as written; **Total Blocking Time in place of INP**,
because Lighthouse cannot produce INP in the mode this run uses. Section 6
records the verification and files the confirmation question.

**D3 (overridable): measurement environment.**

- **Default:** Lighthouse CI measures the static export directly (the real `out/` artifact that Pages serves), with `skipChrome` to skip any browser-specific noise (deterministic, fast).
- **Alternative A:** measure against a real browser run (slower, noisier, more realistic).

*As shipped:* the first half as written — the real `out/` from a production
`npm run build`, served by `e2e/serve.mjs` under the production basePath, so
what is measured is the artifact Pages serves rather than a dev server.
`skipChrome` is **not** a Lighthouse or Lighthouse CI setting and was dropped;
it would have been silently ignored. Lighthouse *is* Chrome driving the page,
so there is no browserless mode to opt into. Run-to-run noise is handled the
way the tool intends instead: `numberOfRuns: 3` with the median run asserted.

**D4 (fixed, per design precedent): CI enforcement posture.**

- The Lighthouse CI job ships as a **non-blocking check** that posts to the PR (it does not become a required context like `lint-and-build` on day one). Why: establishing a baseline on a commit that is already merged to `main` means the first run will capture the current artifact's real performance, not some aspirational target. A blocking gate on the _first_ run would fail every subsequent PR until the baseline is manually tuned, which is backwards — the baseline captures what we ship today, then we can measure regressions going forward.
- Once a baseline is established and stabilizes, a future increment can propose **promoting it to required**.

> **CLOSED 2026-08-08 (PR #161, DevSecOps increment).** `lighthouse` is now a
> required context. The stability D4 asked for was measured rather than
> asserted: `gh run list --workflow=lighthouse.yml --limit 200` returns 58 runs
> since 2026-08-01 with exactly one `failure`, and that one is run
> `30707624249` on `autodev/v0.18-lighthouse-baseline` — a red on the PR branch
> that introduced the workflow, before it merged. Every run after the merge
> commit (`30708005128`, 2026-08-01T16:23:01Z) is green: 55 consecutive, 28 of
> them main pushes, across 7 days, with zero noise-only reds. The
> `numberOfRuns: 5` tightening this file held in reserve for flake was therefore
> never needed and is NOT applied. Required contexts are now
> `["lint-and-build", "lighthouse"]`, declared in
> `.github/required-checks.json` and held to the workflows by
> `src/__tests__/required-checks-contract.test.ts`.

**D5 (overridable): reporting cadence.**

- **Default:** Lighthouse CI runs on every PR (before merge) and on every main push (to track deployed performance). The same threshold applies to both; regressions on main go into the repo's observable history.
- **Alternative A:** main-only (PR noise suppression, but loses the warning before merge).

## 3. Technical plan

### PR1: Lighthouse CI integration + baseline capture — SHIPPED

What actually shipped, and where it departs from the sketch above (the sketch
was written before anything had been run; each departure is a thing the tool
does not do, not a preference):

1. **`.github/workflows/lighthouse.yml`**, a workflow of its own rather than
   steps inside `deploy-pages.yml`. That file triggers on `push: main` only, so
   the job would never have run on the PR that introduced a regression — it
   would have reported after the deploy. It would also have put a
   browser-timing step inside the deployment path, where a flake stops the site
   from shipping. Measuring is not deploying.
2. **`@lhci/cli@0.15.1`, installed and pinned exactly** in the job. There is no
   `@lhci/github-actions` action; the Lighthouse team's documented GitHub
   Actions path is the CLI. Keeping it out of `package.json` is deliberate:
   everything in this repo's dependencies is scanned by the blocking
   `npm audit --audit-level=high` step, and a fresh advisory in CI-only tooling
   would wedge the gate — this repo's single most frequent CI incident
   (PRs #99, #101, #102, #107).
3. **`lighthouserc.cjs`, not `.lighthouserc.json`.** The URL under test has to
   be built from `site-base-path.mjs` — the single source `next.config.ts`,
   `playwright.config.ts` and `e2e/serve.mjs` already share — and JSON cannot
   import. A hardcoded slug is precisely what the 2026-07-29 rename would have
   broken. `.cjs` is first in Lighthouse CI's own config lookup order, and it
   also lets the file carry the reasoning that JSON has nowhere to put.
4. **The three phases run as separate steps** (`collect`, `upload`, summary,
   then `assert`) rather than `lhci autorun`. Autorun stops at the first
   failing phase, so a red gate would leave no report and no summary — exactly
   the run a person most needs to read. Split this way, `assert` is last, so a
   red on this job always means the gate fired.
5. **Reports are kept as a run artifact**, not uploaded to
   `temporary-public-storage` (a Google-operated public bucket). Nothing in the
   report is secret, but a CI job that egresses build output to a third party
   is a surface this repo does not need.
6. **The measured values land in the run summary**, not a PR comment. A comment
   needs `pull-requests: write` on a workflow that otherwise holds
   `contents: read`, and the summary is readable from the same page without
   widening the token. `scripts/lighthouse-summary.mjs` renders it, and also
   prints the calibrated `minScore` floors so recalibration is mechanical.
7. **Only the tracked metrics are asserted**, not `lighthouse:recommended`.
   That preset turns on ~100 audits, most of them accessibility and
   best-practice checks owned by the QA stream, and its red would say
   "something here is imperfect" rather than "this PR regressed performance".

### PR2 (future): "Actual perf optimizations" — not part of this milestone

Future milestones can reference the baseline and assert "we reduced LCP by X ms" with a CI-checkable proof.

## 4. Done-when checklist

- [x] A Lighthouse CI config exists at repo root with D1/D2/D3 applied —
      `lighthouserc.cjs` (see technical plan item 3 for why not `.json`)
- [x] A workflow runs Lighthouse CI on every PR and every main push —
      `.github/workflows/lighthouse.yml` (see item 1 for why not
      `deploy-pages.yml`)
- [x] The first Lighthouse CI run on the PR captures the baseline and reports
      the Core Web Vitals — written to the run summary rather than a PR
      comment, per item 6; measured values in section 7
- [x] This file records the captured baseline values (section 7)
- [x] Quality gate stays green
- [x] The Lighthouse CI check is non-blocking per D4 (appears in PR checks but
      is NOT in `branches.main.protection.required_status_checks.contexts`)
      — true as shipped by PR #136; **superseded 2026-08-08 by PR #161**, which
      promoted it on the evidence D4 asked for (see the CLOSED note in section 2)
- [x] Branch protection remains `["lint-and-build"]` unchanged — true as
      shipped by PR #136; **now `["lint-and-build", "lighthouse"]`** since
      2026-08-08
- [x] The gate is proven able to FAIL, not merely observed passing (section 7)

## 5. Overridable defaults summary

- **D1:** regression threshold = 5-point drop on any Core Web Vital triggers a PR comment / failure (default: fail the merge) — **APPROVED 2026-08-01, shipped**
- **D2:** track LCP + CLS + INP (default: the three Core Web Vitals) — **shipped as LCP + CLS + TBT, see section 6**
- **D3:** measure the static `out/` directory with `skipChrome` (default: fast, deterministic) — **shipped; `skipChrome` does not exist and was dropped**
- **D4:** non-blocking check on every PR and main push (default: fixed, observational) — **shipped as written**
- **D5:** run on every PR + every main push (default: both, regression catching is early) — **shipped as written**

All defaults are RFC-quality (simple, battle-tested, the Lighthouse team's recommendation). All are overridable; user confirms or edits the above before dev work starts.

## 6. The one substitution: TBT stands in for INP

**D2 asked for INP. Lighthouse cannot produce INP in the mode this gate runs,
so the gate tracks Total Blocking Time instead.** This is not a preference; an
INP assertion here would be an assertion that never evaluates, which is worse
than no gate because it reports green about a metric it has never measured.

Verified at the source in `lighthouse@12.6.1` (the version `@lhci/cli@0.15.1`
depends on), rather than inferred from documentation:

| Where | What it says |
| --- | --- |
| `core/audits/metrics/interaction-to-next-paint.js` | `supportedModes: ['timespan']` |
| `core/config/default-config.js` | `{id: 'interaction-to-next-paint', weight: 0, acronym: 'INP'}` |
| `core/config/default-config.js` | `{id: 'total-blocking-time', weight: 30, acronym: 'TBT'}` |

INP measures how long a page takes to respond to a real interaction, so it is
a **field** metric: a lab navigation run has nobody to interact with the page,
and Lighthouse simply skips the audit. That is why the same config gives INP a
weight of zero and gives TBT the single largest weight in the performance
category — TBT *is* Lighthouse's lab stand-in for responsiveness.

`src/__tests__/lighthouse-baseline-contract.test.ts` fails if
`interaction-to-next-paint` is ever added to the assertions, so a later reader
reconciling the gate against D2's literal wording cannot quietly reintroduce
the dead assertion.

**USER DECISION (2026-08-05): TBT stands as the third metric.** The user
confirmed both open defaults directly ("defaults ok"), settling the question
this section originally filed after PR #136 shipped the substitution. Real
INP remains a different and larger piece of work if it is ever wanted - it
needs field data (a `web-vitals` beacon and somewhere to send it, i.e. a
backend this app deliberately does not have) or Lighthouse user-flow timespan
runs that script the interactions - but it is no longer an open question
gating this gate. (Doc edit shipped 2026-08-07 by the v0.21 definition pass.)

## 7. Measured baseline

Measured on `ubuntu-latest` by `.github/workflows/lighthouse.yml`, median of
three runs against the production static export served under the production
basePath. **Numbers from a CI runner, not a developer machine**: the floors
have to sit under the noise of the environment that will actually enforce
them.

URLs measured (v0.20 PR2 widened the gate from `/` alone): the entry route
`http://127.0.0.1:4173/adhd-daily-coach/` and the revenue route
`http://127.0.0.1:4173/adhd-daily-coach/pricing/`, each with its own
thresholds via `assertMatrix`. The contract test holds this table to the
enforced numbers **per URL**: a measured URL with no documented row fails it.

The `/` row set was originally captured from runs `30707333707` and
`30707624249`, Lighthouse 12.6.1, mobile emulation with simulated throttling
(the Lighthouse default, and the conservative side of the measurement);
recalibrated by v0.20 PR1 from run `31167698390` (attempts 1 and 2, same
pinned Lighthouse) after `e2e/serve.mjs` learned gzip. The `/pricing/` row
set is v0.20 PR2's, calibrated on that PR's own runs. Always two independent
runs of three, so the thresholds are set against observed cross-run variance
rather than one sample.

Lighthouse CI aggregates with `optimistic`, so each threshold is really *the
best of the three runs must clear this*.

| Metric | Route | Audit id | Score floor | Numeric ceiling | Best-of-run score | Best-of-run value |
| --- | --- | --- | --- | --- | --- | --- |
| Largest Contentful Paint | `/` | `largest-contentful-paint` | 0.81 | 3200 | 0.86, 0.86 | 2683 ms, 2683 ms |
| Cumulative Layout Shift | `/` | `cumulative-layout-shift` | 0.95 | 0.1 | 1.00 | 0.000 |
| Total Blocking Time | `/` | `total-blocking-time` | — | 500 | 0.99, 0.99 | 72 ms, 70 ms |
| Largest Contentful Paint | `/pricing/` | `largest-contentful-paint` | 0.80 | 3200 | 0.86, 0.85 | 2660 ms, 2701 ms |
| Cumulative Layout Shift | `/pricing/` | `cumulative-layout-shift` | 0.95 | 0.1 | 1.00 | 0.000 |
| Total Blocking Time | `/pricing/` | `total-blocking-time` | — | 500 | 1.00, 0.99 | 52 ms, 90 ms |

Performance category: **0.52** at the identity-harness baseline; **0.96**
best-of-run as of v0.20 PR1. Accessibility 0.96, best practices 1.00,
SEO 1.00.

**Every row above is now calibrated against the gzip-serving harness** (v0.20
PR1, run `31167698390` attempts 1 and 2). The identity-harness history — the
original baseline runs `30707333707`/`30707624249` and the v0.19 ratchets —
is preserved in the subsections below; those numbers describe a heavier
transfer than any visitor was ever served and must not be compared against
the current table directly. See *Recalibrated by v0.20 PR1* below.

### Widened by v0.20 PR2

v0.20 PR2 added `/pricing/` to the measured set - the page a person who
decides to pay actually lands on, and until now a route on which a
performance regression was invisible to the gate. Each URL owns its
thresholds via `assertMatrix`; the routing was verified against
`@lhci/utils@0.15.1` source (a report matched by no entry is silently
asserted by nothing, which is why the contract test proves every measured
URL matches exactly one entry and every entry exactly one URL).

Calibrated on that PR's own runs by the established method - worst
best-of-run across two independent three-run invocations of the same pinned
Lighthouse (run `31171279112`, attempts 1 and 2):

| `/pricing/` | Attempt 1 | Attempt 2 |
| --- | --- | --- |
| LCP samples | 2660, 2673, 2690 ms | 2721, 2701, 2717 ms |
| LCP best-of-run | **2660 ms (score 0.86)** | **2701 ms (score 0.85)** |
| CLS | 0.000 / 1.00 in all three | 0.000 / 1.00 in all three |
| TBT samples | 52, 65, 80 ms | 110, 90, 105 ms |
| TBT best-of-run | **52 ms** | **90 ms** |
| Performance category (best of run) | 0.97 | 0.96 |

**LCP:** floor 0.85 − 0.05 = **0.80** (D1's five-point form); ceiling
2701 ms + ~18.5% headroom = **3200 ms**, the same margin discipline every
ceiling in this file has carried. That it lands on the entry route's number
is expected, not copied: both pages are dominated by the shared first-load
JS, not by their markup (the same runs measured `/` at best-of-run 2656 and
2703 ms).

**CLS:** 0.000 / 1.00 in all six samples, so the entry route's 0.95 / 0.10
pair holds - confirmed by measurement.

**TBT:** no score floor (the shared-runner noise finding above applies
unchanged) and the **500 ms** ceiling kept: best-of-run on unchanged
artifacts has ranged 44-204 ms on this infrastructure, so deriving ~2.5x
from today's two low samples (52, 90 ms) would sit inside that documented
spread and cry wolf - the exact mistake the entry route's TBT derivation
records declining twice.

### Recalibrated by v0.20 PR1

v0.20 PR1 made `e2e/serve.mjs` negotiate gzip the way GitHub Pages does
(guarded by `src/__tests__/serve-compression.test.ts`), so the gate stopped
measuring a transfer ~3.5x heavier than what a visitor is served. Every
threshold was then recalibrated from that PR's own runs by the established
method — worst best-of-run across two independent three-run invocations of
the same pinned Lighthouse (run `31167698390`, attempts 1 and 2):

| | Attempt 1 | Attempt 2 |
| --- | --- | --- |
| LCP samples | 3122, 2683, 2733 ms | 3438, 2710, 2683 ms |
| LCP best-of-run | **2683 ms (score 0.86)** | **2683 ms (score 0.86)** |
| CLS | 0.000 / 1.00 in all three | 0.000 / 1.00 in all three |
| TBT samples | 874, 72, 117 ms | 811, 98, 70 ms |
| TBT best-of-run | **72 ms** | **70 ms** |
| Performance category (best of run) | 0.96 | 0.96 |

The first sample of each invocation is the usual cold-start outlier that
`optimistic` aggregation absorbs; the four warm LCP samples span 50 ms. The
~2.7 s LCP matches PR #143's controlled A/B (2685–2700 ms gzip-served) within
noise — the receipt that D7's attribution of the residual ~5.5 s to the
identity harness was correct.

**LCP:** floor 0.86 − 0.05 = **0.81** (D1's five-point form); ceiling
2683 ms + ~19% headroom = **3200 ms**, the same margin discipline the 6500
(over 5547) and 8000 (over 6757) ceilings carried, and under the 4000 ms
bound the v0.20 done-when demands. Both halves tighten; nothing loosened.

**CLS:** confirmed, not assumed — 0.000 / 1.00 in all six samples. Transfer
encoding does not move layout, and both halves hold unchanged at 0.95 / 0.10.

**TBT:** re-derived and deliberately kept at **500 ms**. The gzip runs
measured best-of-run 72 and 70 ms — compression barely moved the CPU work,
as the milestone predicted — but this metric's history on an unchanged
artifact spans best-of-run 70–204 ms, so a ceiling derived from today's two
low samples (~2.5x 72 = 180 ms) would sit inside the documented cross-run
spread and cry wolf. 500 ms remains ~2.5x the worst best-of-run ever
observed here (204 ms): the derivation that respects the noise record rather
than the lucky day. If it ever proves loose, the remedy is `numberOfRuns: 5`,
never a looser threshold.

### Ratcheted by v0.19 PR1

`docs/design/PERF_PASS.md` D3: **a win the gate does not defend decays back**,
so each PR of the perf pass re-derives its own ceilings from its own measured
run and updates this table in the same commit.

PR #139 rendered the first-run onboarding panel out of normal flow. Measured on
run `30713366106`, three runs, same harness as above:

| | Before (baseline) | After (PR #139) |
| --- | --- | --- |
| CLS value | 0.752 in all six runs | **0.000 in all three runs** |
| CLS score | 0.06 | **1.00** |
| `layout-shifts` entries | one, carrying all of it | **zero** |
| Performance category | 0.52 | 0.73 (best of run; the third run's TBT noise pulled one sample to 0.50) |

Not a smaller shift: no shift. That is the confirmation that the report's
attribution was right — the single moving node was `section.panel`, and the
only thing that could appear above it was the first-run panel.

The new floor is D1's approved form at last doing the work: 1.00 − 0.05 =
**0.95**, roughly a raw CLS of 0.05, and it is now the binding half of the
assertion. The 0.10 ceiling is D2's target (the Core Web Vitals "good"
boundary) kept as a backstop for the case an upstream Lighthouse moves the
scoring curve. A ceiling of exactly 0.0 was rejected: it would fail an honest
PR over a 0.001 shift, and a gate that cries wolf is the failure mode TBT's
missing score floor already documents below.

LCP and TBT are deliberately untouched here. PR1 was a layout fix and did not
address the 1.69 MB of script the entry route downloads, which is v0.19 PR2's
subject; ratcheting a metric a PR did not improve would just import runner
noise into the gate.

### Ratcheted by v0.19 PR2

PR #140 removed `zod` from the entry route (PERF_PASS.md D5). Measured on runs
`30715170249` and `30715529983` — **two independent runs of three, the same
standard the original calibration was held to**:

| | Before (baseline) | After (PR #140) |
| --- | --- | --- |
| LCP value (best of run) | 6756.8 ms, 6757.2 ms | **5403 ms, 5547 ms** |
| LCP score (best of run) | 0.07, 0.07 | **0.20, 0.18** |
| Script transfer (`resource-summary`) | 22 requests, ~1.69 MB | **21 requests, 1,445,861 B** |
| `unused-javascript` savings | 1,047 KiB | 843,159 B |
| Performance category (best of run) | 0.52 | **0.77** |

Per-sample, so the noise is visible rather than hidden behind the aggregate:
`11851, 5403, 5535` and `8984, 5558, 5547`. The first sample of each run is a
cold-start outlier of exactly the kind `optimistic` aggregation exists to
absorb; the four warm samples span 155 ms in total.

**LCP has left the saturated region, so D1's five-point score floor does real
work here for the second time**, exactly the mechanism the CLS ratchet above
predicted would start biting "the moment these metrics improve".

**The floor is 0.13, and it was deliberately loosened from 0.15 before merge.**
The first run alone gave 0.20, so D1's five points read 0.15, and that is what
this PR originally committed. The second run then came in at 0.18 — passing, but
with only three points of headroom. Three points on a browser timing is inside
the noise this very document records for TBT, so the floor was recalibrated
against the WORST best-of-run rather than the first one seen: 0.18 − 0.05 =
0.13. Calibrating a ratchet against the single flattering sample is how a gate
starts crying wolf, and TBT's lost score floor below is what that costs.

The numeric ceiling drops 8000 → **6500 ms**: the worst best-of-run 5547 ms plus
~17 % headroom, close to the ~18 % the original 8000 carried over 6757. It is
the looser half of the assertion, kept as the backstop for a Lighthouse scoring
change, exactly as the CLS ceiling is. If the floor still proves noisy, the
remedy is `numberOfRuns: 5` — tightening the aggregation — and NOT loosening the
threshold, per the standing rule below.

TBT is untouched here for the same reason PR1 left LCP alone: its best-of-run
values in this run were 176 ms and 163 ms against a 500 ms ceiling, comfortably
inside the noise band already documented, and a metric this PR did not set out
to improve should not import that noise into the gate.

### Total Blocking Time gets no score floor, and that is a finding

The first calibration set TBT at `minScore: 0.9` — its measured 0.96 minus
D1's five points — and **the very next run went red on it**: run `30707624249`
reported `expected >=0.9, found 0.89`, with per-run values of 0.24, 0.87, 0.89,
on a completely unchanged artifact.

That red is kept here as evidence rather than argued away. TBT measures
main-thread blocking, so on a shared CI runner it is substantially measuring
what else that host happens to be doing. Across the two runs its best-of-three
score moved 0.96 → 0.89 and its best-of-three value moved 128 ms → 204 ms, with
one sample as bad as 1092 ms, all with no code change.

**A five-point tolerance sits inside that noise.** A score floor there would
fail honest PRs at random, and a gate that cries wolf is worse than no gate,
because people learn to merge through red. So TBT is gated on its raw value
with real headroom (500 ms, ≈2.5× the worse of the two observed bests) instead.

D1's five-point form is not viable for this metric on this infrastructure. That
is a finding about the runner, not a softening of the decision — LCP and CLS
keep their score floors. **USER DECISION (2026-08-05): confirmed** ("defaults
ok"), alongside the TBT-for-INP substitution in section 6, so the raw-value
gating for TBT is the settled shape rather than a divergence awaiting review.

### Why two metrics also carry a numeric ceiling

D1's approved form is a score floor at `measured − 0.05`, and that works only
while the score has room to fall. The first measurement came in at LCP 0.07 and
CLS 0.06, so the literal floors are 0.02 and **0.00** — and a floor of 0.00
cannot fail, because a score is never negative.

Shipping that would be a dead gate reporting green forever, which is exactly
what the INP assertion was rejected for in section 6. Rejecting it there and
accepting it here would be the same mistake wearing a different hat.

Lighthouse scores are a saturating curve over the raw value: once a metric is
deep in the red, a large real regression barely moves the score. So for the two
saturated metrics the regression signal is the **raw value**, and the ceilings
sit just above the worst of the three measured runs. The score floors are kept
alongside them because they are D1's approved form and they start biting again
the moment these metrics improve.

**That last sentence has since come true, which is why this subsection is now
partly history.** v0.19 PR1 took CLS from 0.752 to 0.000, so its floor was
ratcheted to 0.95 and is a live gate rather than a decoration; only
`largest-contentful-paint` is still gated primarily by its raw value. Two
sentences here were also stale on arrival and are corrected in the same edit
rather than left to harden: the original text read *"the two saturated metrics"*
counting LCP and CLS, and closed with *"`total-blocking-time` needs no ceiling:
at 0.96 its floor of 0.90 is a live gate on its own"* — which is the opposite of
what shipped. TBT has **no score floor and a 500 ms ceiling**, for the runner-
noise reason the subsection immediately above spells out with its evidence.

`src/__tests__/lighthouse-baseline-contract.test.ts` enforces the general rule
this came from: **no tracked metric may be gated only by a predicate that
cannot fail.**

### What the baseline immediately revealed

This is the point of the milestone, and it paid for itself on the first run:
**the entry route scores 0.52 on performance**, with a 6.8 s Largest Contentful
Paint and a 0.752 Cumulative Layout Shift on emulated mobile. Both are well
into Lighthouse's red band, and CLS at 0.752 means roughly three quarters of
the viewport moves under the reader after first paint — on an app whose entire
product premise is being calm to use with ADHD.

Nobody had measured this before, and nothing in CI would have told us. Filed as
a bug in the backlog and it is the natural seed for the v0.19 perf pass, which
now has a CI-checkable "before" to defend its "after" against.

### Recalibrating

Mechanical, not a judgement call: every run prints its own calibrated floors to
the job summary, so a deliberate future change in the performance profile is a
copy of those numbers into `lighthouserc.cjs` plus this table — and the
contract test fails if only one of the two is updated.
