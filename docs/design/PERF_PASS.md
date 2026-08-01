# Perf pass: the first screen arrives calm and stops moving

Status: **DESIGN, awaiting user sign-off on D1 through D7.** Every decision below
carries an overridable default, so the whole set can be accepted with one word.

This milestone is the one v0.18 was built to make possible. v0.18 shipped
measurement only and deliberately fixed nothing
([WEB_VITALS_BASELINE.md](WEB_VITALS_BASELINE.md)); the first measurement it
produced is the HIGH bug this milestone closes.

## 0. Executive summary

The entry route scores **0.50 on Lighthouse performance**, with a **6.8 s
Largest Contentful Paint** and a **0.752 Cumulative Layout Shift**. On an app
whose product premise is being calm to use with ADHD, a CLS of 0.752 means
roughly three quarters of the viewport moves under the reader after first paint.
That is not a number problem, it is the product contradicting itself.

Both headline numbers now have a **named, measured cause**, read out of the
Lighthouse report JSON from run `30709755854` (the post-merge main run of PR
#137) rather than guessed:

| Metric | Measured | Cause found in the report |
| --- | --- | --- |
| CLS 0.752 | one single shift, all of it | `main#main-content > div.page-shell > div.mx-auto > section.panel` moves. The only node that can appear above it is the first-run onboarding block. |
| LCP 6.8 s | 93 % of it is **render delay** | TTFB 454 ms, load delay 0 ms, load time 0 ms, render delay 6371 ms. Nothing is waiting on the network for the LCP element; it waits on script. |
| TTI 12.9 s | 22 scripts, 1.69 MB of JS | 1,047 KiB of it is reported unused on this route. The largest single chunk is 670 KB and carries the Firebase SDK. |

So the milestone is two independent halves, and neither is speculative:

- **PR1 stops the shift** (a layout fix, no bundle work).
- **PR2 stops shipping code the first screen cannot use** (a bundle fix, no
  layout work).

Because v0.18 already gates LCP, CLS and TBT on every PR, each half can prove
its own "after" against a recorded "before" in CI instead of by opinion. That
was the entire point of doing v0.18 first.

## 1. Scope

### In scope

- Remove the single layout shift on `/` and bring **CLS to the "good" band**.
- Reduce the JavaScript the entry route must download and execute before it can
  finish rendering, targeting the two chunks the report actually names.
- **Ratchet the v0.18 gate down** to the improved numbers in the same PR that
  improves them, so a win is defended instead of decaying.
- Keep the v0.18 doc/config parity guard
  (`src/__tests__/lighthouse-baseline-contract.test.ts`) true by updating both
  sides together.

### Out of scope

- Any visual redesign, copy change, or new surface. This milestone should be
  invisible except for the app arriving sooner and not jumping (D6).
- Routes other than `/`. The gate measures one URL today, and widening it is
  already a separate filed follow-up. Fixing `/` first keeps the before/after
  unambiguous.
- Promoting the `lighthouse` check to a required context. Also already filed
  separately, and it should earn requiredness on stability, not on a good week.
- Image work: the report shows **zero images** on this route, so there is
  nothing to optimize there.
- Font work: `font-display` already scores 1, and three fonts total 53 KiB.
  There is no finding here either.

## 2. Design decisions

**D1 (overridable): how the layout shift is removed. Default = take the
first-run overlay out of normal flow.**

The shift has exactly one contributor and its shape is fully determined by two
facts that are already true and already tested:

1. `out/index.html` contains no onboarding markup at all
   (`grep -c 'onboarding-container' out/index.html` returns 0). PR #124
   deliberately made `showOnboarding` start `false` and settle in a deferred
   effect, to fix a hydration mismatch, and pinned that with the regression test
   `keeps the onboarding overlay out of the first render pass, so it matches the
   prerender`.
2. The overlay renders as an **in-flow block** immediately above
   `section.panel` (`src/app/page.tsx`, the `showOnboarding && (...)` branch
   inside `div.mx-auto`).

Put together: a first-time visitor is served the dashboard, then hydration
raises the overlay, then the entire dashboard is pushed down by the overlay's
full height. That is the 0.752.

The default fix is to render the first-run overlay **out of flow** (fixed,
full-viewport, with a scrim and its own stacking context) so that its
appearance cannot move anything. This is chosen over the two alternatives
because it is the only one that does not trade the bug for a different one:

- *Alternative A, reserve the space with the existing pre-hydration bootstrap.*
  `layout.tsx` already ships an inline script that reads
  `calm-daily-coach:theme` before paint, so the pattern exists and could set an
  attribute for a pending first run. But reserving the overlay's height means
  hardcoding a magic pixel height that silently desyncs the first time the
  onboarding copy changes, and a returning visitor would pay for a blank
  reservation.
- *Alternative B, move onboarding to its own route.* Cleanest structurally, but
  it turns a first-run panel into a redirect, which is a real product change and
  a heavier one than this milestone should carry.

**The constraint that makes this checkable rather than a matter of taste: PR
#124's regression test must pass UNCHANGED.** If that test has to be edited, the
fix reintroduced the hydration mismatch and is wrong. The same applies to the
existing onboarding tests: the component's behavior is not what is changing,
only where it is painted.

Accessibility is part of done here, not a follow-up: an out-of-flow first-run
panel needs a focus move on appear, Escape mapped to the existing skip action,
focus contained while it is open, and it must honor the reduced-motion reset
v0.8 already established.

**D2 (overridable): the targets. Default = CLS ≤ 0.10 and LCP ≤ 4.0 s on the
gate's own harness, plus first-load script weight ≤ 1.0 MB uncompressed.**

CLS ≤ 0.10 is the Core Web Vitals "good" boundary and is the honest target once
the only shift is gone; it should in fact land at or near 0. LCP ≤ 4.0 s is
deliberately NOT the 2.5 s "good" boundary: 2.5 s under this harness (see D7)
is a different and much larger piece of work than removing dead weight from the
entry chunk, and a target nobody can hit is a target that gets quietly dropped.
TBT keeps its existing raw ceiling and no score floor, unchanged, for the runner
noise reason recorded in WEB_VITALS_BASELINE.md section 7.

**D3 (overridable): the gate ratchets down in the same PR that improves the
metric. Default = yes.**

`lighthouserc.cjs` currently holds ceilings at LCP 8000 ms and CLS 0.80, both
set just above the measured baseline. A PR that improves CLS from 0.752 to 0.02
and leaves the ceiling at 0.80 has bought a number, not a guarantee: the app
could regress all the way back the next day under a green gate. So each PR of
this milestone re-derives its ceilings from its own measured run and updates
both `lighthouserc.cjs` and section 7 of WEB_VITALS_BASELINE.md, which the
contract test already pins to each other.

Note the pleasant consequence of D1 landing: once CLS is out of the saturated
region, D1's approved five-point score floor starts biting again on its own,
which is exactly what WEB_VITALS_BASELINE.md predicted would happen "the moment
these metrics improve".

**D4 (overridable): Firebase stops loading on first paint. Default = load it
lazily, and split Firestore from Auth.**

`src/lib/firebase.ts` statically imports `firebase/app`, `firebase/auth` AND
`firebase/firestore`. It is imported by `src/app/hooks/use-coach-auth.ts`, which
is used by `subscription-guard.tsx`, which `layout.tsx` wraps every route in.
So every page of this app downloads the whole Firebase SDK, and the report shows
it: a 670 KB chunk carrying `@firebase/app`, `@firebase/auth` and
`@firebase/firestore`, of which **531 KiB is unused on `/`**, whose script
execution shows up as a 323 ms long task.

The default is to defer it rather than remove it: the SDK is genuinely needed
for a signed-in person, but it is not needed to paint the first screen, and it
is needed even later for Firestore, which nothing touches until a store actually
reads or writes. Concretely: dynamic `import()` behind first use, auth resolved
after first paint, Firestore split into its own lazily loaded chunk.

**The measured artifact this must be checked against is the one with no
Firebase config.** The Lighthouse build receives no `NEXT_PUBLIC_FIREBASE_*`
values (only `deploy-pages.yml` passes them), so on the measured build the SDK
is downloaded and parsed and then never initializes, because `readConfig()`
returns null. That makes the waste unusually visible in the baseline, and it
also means the gate cannot see the runtime cost of auth on the deployed build.
See D7.

**D5 (overridable): zod leaves the entry route. Default = replace the two small
schemas with hand-written validation and drop the dependency, but only after
chunk attribution confirms the weight.**

The report's second largest chunk is 295 KiB with **224 KiB unused on `/`**, and
a marker scan of the built chunks finds `zod` in that one and nowhere else. zod
has exactly two consumers in this repo, and both schemas are tiny:
`onboardingPreferencesSchema` (three enum fields, `src/lib/onboarding.ts:29`)
and `dailyPlanInputSchema` (two enums plus an optional string capped at 280,
`src/lib/plan.ts:23`).

Two reasons this is worth doing beyond the bytes. First, the repo already
hand-writes the tolerant half of exactly this parse: `readOnboardingDefaults`
in the same module reads the same record per field without zod, so a
hand-written strict reader sits next to a hand-written tolerant one rather than
introducing a new style. Second, **every production dependency is scanned by
the blocking `npm audit --audit-level=high` step in `ci.yml`**, which is this
repo's single most frequent CI incident (PRs #99, #101, #102, #107), and PR
#119 already set the precedent of deleting a production dependency the app did
not need.

The gate on this decision is honesty about attribution: a chunk containing the
string `zod` is evidence, not proof, that zod is most of its weight. PR2's first
task is to attribute chunk to module properly (the Next build manifest, or a
one-off bundle analysis run) and to record the real number. **If attribution
shows zod is a minority of that chunk, this decision is dropped and said so in
the PR**, rather than the schemas being rewritten for a win that was not there.

**ATTRIBUTION RESULT (PR2, 2026-08-01): the decision is CONFIRMED, by
measurement rather than by marker scan.** Source maps were tried first and are
not usable here: `productionBrowserSourceMaps: true` under Turbopack 16.2.11
emits 26 `.map` files whose `.js` siblings do not exist in `out/`, and exactly
one of the twelve chunks the entry document loads has a usable map. So the
attribution was done as a **counterfactual build** instead, which answers the
sharper question anyway ("what does removing it actually save", not "what
share of these bytes is nominally zod's"):

| Build | Scripts on `out/index.html` | Total |
| --- | --- | --- |
| baseline (`origin/main`, 28ad62b) | 12 | 1,672,898 B |
| zod's two consumers hand-written | 11 | 1,389,779 B |

**-283,119 bytes, and the 301,096-byte chunk disappears entirely** rather than
shrinking, so zod was ~94 % of it. That is a majority by a wide margin and the
schemas are worth rewriting. Method note for anyone repeating this: measure the
scripts the ENTRY DOCUMENT references, not `out/_next/static/chunks/*`, which
also contains every other route's chunks.

**D6 (fixed): no user-visible change other than "it arrives sooner and does not
jump".**

No copy changes, no new surfaces, no layout redesign, no product-rule surface
of any kind. The onboarding panel changes where it is painted (D1) and nothing
else. Every existing test that describes current behavior must pass unchanged;
the ones that must change are the ones asserting the defect.

**D7 (overridable): the measurement harness stays as it is, and its two known
divergences from the deployed site are recorded rather than fixed. Default =
record, do not change.**

Two facts about the harness were confirmed during this design pass, and both
mean the gate measures a **strictly heavier** page than a real visitor is
served. Neither invalidates the gate, which is a relative regression detector,
but both matter for reading the absolute numbers:

1. **The measured server does not compress.** `e2e/serve.mjs` is stdlib-only and
   pipes files straight to the response with no `content-encoding`; GitHub Pages
   serves `content-encoding: gzip`. Measured on the live site: the 13 static
   assets referenced by the deployed entry document total **1,751,261 bytes
   uncompressed and 494,416 bytes gzipped**, a 3.5x difference. Since
   Lighthouse's default simulated throttling derives its timings from transfer
   size, the 6.8 s LCP is pessimistic for the deployed site.
2. **The measured build has no Firebase configuration** (D4), so it does not pay
   auth resolution at runtime, which is a cost the deployed build does pay.

The default is to leave both alone for this milestone and to say so in the doc,
for two reasons. Adding compression to `serve.mjs` would move every baseline
number at once and would recalibrate the gate on the same day this milestone is
trying to prove an improvement against it, making the before/after unreadable.
Passing the Firebase secrets into a `pull_request`-triggered workflow on a
public repository is a supply-chain decision, not a performance one, and it
should not be made as a side effect of a perf pass.

The alternative, worth taking if the user prefers absolute realism over a stable
baseline, is to do both as a v0.20 measurement-accuracy pass with a clean
recalibration and no other change in the same PR.

## 3. Technical plan

### PR1: stop the shift — SHIPPED (PR #139, 2026-08-01)

Measured on the PR's own Lighthouse run `30713366106`: **CLS 0.752 → 0.000 in
all three runs, score 0.06 → 1.00, and `layout-shifts` reports zero entries** —
not a smaller shift, no shift. That is also the confirmation that section 0's
attribution was correct. The CLS ceiling was ratcheted in the same PR (D3) to
`minScore: 0.95, maxNumericValue: 0.1`, and section 7 of
[WEB_VITALS_BASELINE.md](WEB_VITALS_BASELINE.md) carries the same two numbers,
which `src/__tests__/lighthouse-baseline-contract.test.ts` enforces.

- Render the first-run onboarding block out of normal flow per D1, with focus
  move, Escape to skip, focus containment, and the reduced-motion reset honored.
- Keep `showOnboarding` exactly as PR #124 left it: `false` on first render,
  raised in the deferred effect. **`keeps the onboarding overlay out of the
  first render pass, so it matches the prerender` must appear nowhere in the
  diff.**
- Re-derive `lighthouserc.cjs`'s CLS ceiling from this PR's own Lighthouse run
  and update section 7 of WEB_VITALS_BASELINE.md in the same commit (D3).
- Behavior-difference proof: reverting the positioning change must make a new
  assertion fail, and the Lighthouse job on this PR must show CLS falling from
  0.752 in the run summary the v0.18 workflow already writes.

### PR2 and PR3: stop shipping code the first screen cannot use

**This half was planned as one PR and is being shipped as two.** The split is
recorded here rather than left as a surprise in the git log, because the plan
matching reality is this repo's most frequent defect class.

The reason is size, measured rather than felt: D4 (defer Firebase) reaches
**12 runtime files and 21 test files**, because `getFirebaseFirestore()` is
called synchronously as a capability probe by three store factories
(`checkin-store.ts`, `focus-session-store.ts`, `journal-store.ts`) as well as
by `subscription-guard.tsx` and `page.tsx`, and four `firestore-*.ts` modules
statically import `firebase/firestore`. Every one of those paths has to break
for the SDK to leave the entry chunk, and each one turns a sync call into an
awaited one. D5 (drop zod) reaches 2 runtime files and touches no async
boundary at all. Shipping them together would put a mechanical dependency swap
and a wide auth/persistence refactor in one unreviewable diff, and an auth
regression is the worse of the two risks by a distance.

**PR2 - zod leaves the entry route (D5). SHIPPED (PR #140, 2026-08-01).**

- Attribution first, per D5's honesty gate: recorded in D5 above, confirmed by
  counterfactual build (-283,119 B, chunk gone entirely).
- The two schemas are hand-written against three primitives in
  `src/lib/parse.ts` (`isRecord`, `readEnum`, `readBoundedString`), keeping the
  `safeParse` shape the existing tests describe.
- `zod` removed from `dependencies`.
- **Behavior-preserving receipt: `src/lib/__tests__/onboarding.test.ts` and
  `src/lib/__tests__/plan.test.ts` are not in the diff and still pass** - they
  were written against zod and they now exercise the hand-written path.
- Re-derives the LCP ceiling from its own run (D3).
- Does NOT bump `package.json`: the milestone is not complete until PR3, and
  0.19.0 with a non-DONE v0.19 heading is a red `roadmap-milestone-status
  .test.ts` by construction. Same reasoning as v0.14 PR1 (PR #117).

**PR3 - Firebase stops loading on first paint (D4). NEXT.**

- Split `src/lib/firebase.ts` into a config probe with no SDK import (the
  synchronous `isFirebaseConfigured()` that the store factories actually want)
  and async `loadFirebaseAuth()` / `loadFirebaseFirestore()` behind dynamic
  `import()`.
- Move the `firebase/firestore` imports in `firestore-checkins.ts`,
  `firestore-focus-sessions.ts`, `firestore-journal.ts` and `firestore-user.ts`
  inside their already-async functions.
- `use-coach-auth.ts`: `authConfigured` becomes a config read rather than
  `getFirebaseAuth() !== null`, and the SDK loads inside the effect.
- **Carries the `package.json` bump to 0.19.0 and flips the roadmap heading to
  DONE in the same commit**, per the `roadmap-milestone-status.test.ts`
  contract.
- Re-derives the LCP ceiling again from its own run (D3).

## 4. Done-when (checkable)

Every line below is checkable by a command or by a CI run, not by opinion.

- [x] The Lighthouse job on the final PR reports **CLS ≤ 0.10** on `/`
      (from 0.752), and `layout-shifts` reports no shift above 0.05.
      *(PR #139: 0.000 in all three runs of run `30713366106`, zero shift
      entries. The gate now holds it at `minScore: 0.95` / `≤ 0.1`, so PR2
      cannot silently give it back.)*
- [ ] The Lighthouse job on the final PR reports **LCP ≤ 4.0 s** on `/`
      (from 6.8 s).
      *(PR #140: 6757 ms → **5403 ms and 5547 ms** best-of-run across two
      independent runs (`30715170249`, `30715529983`), score 0.07 → 0.20/0.18.
      Two fifths of the way; the gate now holds it at `minScore: 0.13` /
      `≤ 6500 ms` so it cannot be given back. The rest is PR3's Firebase
      chunk.)*
- [ ] Script transfer for `/` on the gate's harness is **≤ 1.0 MB** (from
      1.69 MB), verifiable from the same report JSON's `resource-summary`.
      *(PR #140: **21 requests / 1,445,861 B** on run `30715170249`, from 22
      requests / ~1.69 MB. Measured independently on the built `out/`, the
      entry document's own script set went 1,672,898 B across 12 chunks →
      1,389,779 B across 11. Not met yet and not expected to be until PR3: the
      669,957 B Firebase chunk is most of the remaining gap.)*
- [ ] `lighthouserc.cjs` and section 7 of
      [WEB_VITALS_BASELINE.md](WEB_VITALS_BASELINE.md) both carry the new
      numbers, and `src/__tests__/lighthouse-baseline-contract.test.ts` is green
      (it fails if they disagree).
- [ ] `keeps the onboarding overlay out of the first render pass, so it matches
      the prerender` passes unchanged, and does not appear in either PR's diff.
- [x] If zod was removed: `npm ls zod` reports it absent from `dependencies`,
      and `src/__tests__/static-export-surface.test.ts` stays green (it fails on
      an unimported production dependency).
      *(PR #140: `npm ls zod` now reports it only under
      `eslint-config-next > eslint-plugin-react-hooks > zod-validation-error`,
      i.e. a dev-tooling transitive, and `grep -n zod package.json` is empty.)*
- [ ] The five pinned gate commands from `.github/workflows/ci.yml` are green on
      both PRs, and the `e2e` job is green (the four Playwright journeys walk
      the first-run path this milestone moves).
- [ ] `package.json` reads 0.19.0 and the roadmap's v0.19 heading reads DONE, in
      the same commit.

## 5. Overridable defaults summary

| ID | Decision | Default |
| --- | --- | --- |
| D1 | How CLS is fixed | First-run overlay rendered out of normal flow; PR #124's regression test must pass unchanged |
| D2 | Targets | CLS ≤ 0.10, LCP ≤ 4.0 s, script ≤ 1.0 MB on the gate's harness |
| D3 | Gate ratchet | Ceilings re-derived and lowered in the same PR that improves the metric |
| D4 | Firebase | Loaded lazily after first paint; Firestore split from Auth |
| D5 | zod | Removed from `dependencies` in favour of hand-written validation, only if chunk attribution justifies it |
| D6 | User-visible change | None beyond "arrives sooner, does not jump" (fixed, not overridable) |
| D7 | Harness divergences | Recorded, not changed, in this milestone |

## 6. What was considered and not chosen

- **Widening the gate to more routes.** Already a filed follow-up from PR #136,
  and doing it inside this milestone would make every before/after ambiguous.
- **`lighthouse:recommended`.** Rejected for the same reason v0.18 rejected it:
  it answers "is this repo imperfect" rather than "did this PR regress".
- **Image and font work.** The report shows zero images and `font-display` at
  score 1. There is no finding to act on.
- **Render-blocking resources.** Reported savings: 0 ms. Nothing to do.
- **Legacy JavaScript (43 KiB) and `numTasksOver100ms` (0).** Real but small
  next to a 670 KB chunk and a 0.752 CLS, so they are noted and left.
