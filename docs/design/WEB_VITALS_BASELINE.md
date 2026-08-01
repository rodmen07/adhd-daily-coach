# Web Vitals Baseline: Measure, then optimize

Status: DESIGN, awaiting user sign-off on decision D1.

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

**D1 (overridable): baseline threshold + regression gate.**

- **Default:** establish a "regression means 5+ point drop on any Core Web Vital" gate that **fails the PR** and prevents merge.
- **Alternative A:** softer gate — regression is advisory, emits a comment/annotation but does not block.
- **Alternative B:** no gate at all — baseline is for information only, no CI enforcement.

**D2 (overridable): which Core Web Vitals to track.**

- **Default:** Lighthouse's three main metrics: Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), Interaction to Next Paint (INP).
- **Alternative A:** add additional metrics (First Contentful Paint, Time to First Byte, Performance score).
- **Alternative B:** track only LCP (the most critical to perceived performance).

**D3 (overridable): measurement environment.**

- **Default:** Lighthouse CI measures the static export directly (the real `out/` artifact that Pages serves), with `skipChrome` to skip any browser-specific noise (deterministic, fast).
- **Alternative A:** measure against a real browser run (slower, noisier, more realistic).

**D4 (fixed, per design precedent): CI enforcement posture.**

- The Lighthouse CI job is a **non-blocking check** that posts to the PR (it never becomes a required context like `lint-and-build`). Why: establishing a baseline on a commit that is already merged to `main` means the first run will capture the current artifact's real performance, not some aspirational target. A blocking gate on the _first_ run would fail every subsequent PR until the baseline is manually tuned, which is backwards — the baseline captures what we ship today, then we can measure regressions going forward.
- Once a baseline is established and stabilizes, a future product increment can propose **promoting it to required** if desired.

**D5 (overridable): reporting cadence.**

- **Default:** Lighthouse CI runs on every PR (before merge) and on every main push (to track deployed performance). The same threshold applies to both; regressions on main go into the repo's observable history.
- **Alternative A:** main-only (PR noise suppression, but loses the warning before merge).

## 3. Technical plan

### PR1: Lighthouse CI integration + baseline capture

1. **Add Lighthouse CI** to `.github/workflows/deploy-pages.yml` (runs after the static export is built):
   - Use the official `@lhci/github-actions` action (`^5.5.0` or latest)
   - Input: the built `out/` directory (the production Pages artifact)
   - Output: a comment on every PR with the measured Core Web Vitals and any regressions vs. baseline
   - Threshold: **D1's default (5-point regression gate) or user's override**

2. **Create `.lighthouserc.json`** at repo root to configure the baseline:
   ```json
   {
     "ci": {
       "collect": {
         "numberOfRuns": 3,
         "staticDistDir": "./out",
         "settings": {
           "skipChrome": true
         }
       },
       "upload": {
         "target": "temporary-public-storage"
       },
       "assert": {
         "preset": "lighthouse:recommended",
         "assertions": {
           "categories:performance": ["warn", { "minScore": 0 }],
           "metrics:largest-contentful-paint": ["error", { "maxNumericValue": <D2-default-LCP> }],
           "metrics:cumulative-layout-shift": ["error", { "maxNumericValue": <D2-default-CLS> }],
           "metrics:interaction-to-next-paint": ["error", { "maxNumericValue": <D2-default-INP> }]
         }
       }
     }
   }
   ```

3. **Update `docs/ROADMAP.md`'s Current state** section with the captured baseline (after first run) and record it here: `docs/WEB_VITALS_BASELINE.md`

### PR2 (future): "Actual perf optimizations" — not part of this milestone

Future milestones can reference the baseline and assert "we reduced LCP by X ms" with a CI-checkable proof.

## 4. Done-when checklist

- [ ] `.lighthouserc.json` exists at repo root with D1/D2/D3 decisions applied
- [ ] `.github/workflows/deploy-pages.yml` updated to run Lighthouse CI after `upload-pages-artifact`
- [ ] First Lighthouse CI run on the PR captures the baseline and posts a comment with Core Web Vitals (LCP, CLS, INP)
- [ ] `docs/WEB_VITALS_BASELINE.md` (this file) is updated with the captured baseline values
- [ ] Quality gate stays green (no lint/typecheck/test/build changes needed)
- [ ] The Lighthouse CI check is non-blocking per D4 (appears in PR checks but is NOT in `branches.main.protection.required_status_checks.contexts`)
- [ ] Branch protection remains `["lint-and-build"]` unchanged

## 5. Overridable defaults summary

- **D1:** regression threshold = 5-point drop on any Core Web Vital triggers a PR comment / failure (default: fail the merge)
- **D2:** track LCP + CLS + INP (default: the three Core Web Vitals)
- **D3:** measure the static `out/` directory with `skipChrome` (default: fast, deterministic)
- **D4:** non-blocking check on every PR and main push (default: fixed, observational)
- **D5:** run on every PR + every main push (default: both, regression catching is early)

All defaults are RFC-quality (simple, battle-tested, the Lighthouse team's recommendation). All are overridable; user confirms or edits the above before dev work starts.
