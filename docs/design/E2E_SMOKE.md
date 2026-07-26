# v0.16 - E2E smoke: the product walked by a real browser

Status: **DESIGN**, defined 2026-07-26 by a product-role increment, the
milestone after v0.15. Nothing in it waits on a user gate; both PRs are
agent-doable.

Every decision in section 3 is an **overridable default**. The user is the
product owner; this document brings the decision rather than making it. Saying
"go" accepts the lot.

---

## 1. What is true today (verified, not recalled)

Every fact below was checked against the source tree at `b0480ad`
(= `origin/main`, v0.15 complete) and the live deployment on 2026-07-26.

**Fact A - every test this repo has ever run lived in jsdom.** The full suite
(533 tests as of PR #124) runs under `environment: "jsdom"`
(`vitest.config.ts`), and no test has ever launched a browser, executed real
hydration, or fetched the artifact GitHub Pages actually serves. Verified, not
recalled: `@playwright/test` is not installed (`ls node_modules/@playwright`
fails; the only two `playwright` strings in `package-lock.json` are `next`'s
own *optional* `peerDependencies` declaration at line 9588, which is next
advertising that it can integrate with Playwright, not us having it), and
`grep -c playwright package.json` = 0. No other browser runner (cypress,
webdriverio, puppeteer) appears in `package.json` either.

**Fact B - the defect classes that slipped through 500+ green tests are
exactly the ones a browser sees.** Three from the last four days:

- The deployed site served spinner-only HTML on **every route** while the whole
  suite stayed green; it was found by hand-`curl`ing the live artifact during
  the PR #114 QA pass, not by any test.
- The onboarding hydration mismatch (fixed in PR #124) is pinned today by a
  `renderToStaticMarkup` test, which runs the render phase only. It is a good
  proxy, and it is still not hydration: no test boots the prerendered HTML in a
  real browser and lets React attach to it.
- The check-in ring reset-on-reload (fixed in PR #90) was a full-page-lifecycle
  bug: jsdom tests remount components, but nothing reloads a page.

**Fact C - the artifact has a specific production shape that `next dev` does
not have.** `next.config.ts`: `output: "export"`, `trailingSlash: true`,
`basePath: "/calm-daily-coach"` in production builds. The live deploy
(probed today: HTTP 200, 28043 bytes on `/`, zero occurrences of the old
spinner) serves prerendered HTML that the client then hydrates. A suite that
walks `next dev` would test none of that shape.

**Fact D - CI has a working precedent for "runs on every PR, gates nothing".**
Branch protection requires exactly `["lint-and-build"]`, posted by the
consolidated quality gate. `security-audit.yml` (PR #111) runs daily and on its
own PRs without being a required context, precisely because a new surface with
an external failure mode must earn requiredness rather than assume it.

**Fact E - vitest currently owns every test-shaped filename.**
`vitest.config.ts` sets no `test.include`, so vitest's default glob claims any
`*.test.*` / `*.spec.*` file anywhere outside `node_modules`. Playwright specs
dropped into the tree naively would be executed (and crash) under jsdom.
Section 3 D5 exists because of this fact.

---

## 2. Why this milestone, over the alternatives

Playwright E2E has been the standing recommendation since the v0.15 definition
(PR #122): its recorded objection ("a suite written now would encode the
behavior v0.14 changes") expired when v0.14 shipped, and it was declined for
v0.15 **on ordering only** - a browser suite written then would have pinned the
first-run path with its hydration mismatch and silent sign-in intact. Both are
now fixed (PR #123, PR #124), so the suite written today pins the *correct*
behavior. Waiting longer buys nothing: every future milestone adds surface the
suite would have to cover retroactively.

Weighed against, and preferred over:

- **FCM push**: still multiple USER-ONLY console gates before any code is
  exercisable.
- **A performance pass**: still no web-vitals baseline, so "faster" is not
  CI-checkable; instrumentation would have to come first.
- **Extending guest migration to planner state / slicer history**: cheap, but
  deepens what a guest *keeps*; v0.13 D7 scoped them out as ephemeral and
  nothing has changed that.
- **The LOW `StatusMessage` consolidation** (`## Bugs`): a design call across
  five surfaces, real but small; it can ride a later milestone.

---

## 3. Decisions (each an overridable default)

**D1 - scope: three smoke journeys plus a console-error tripwire, not a
coverage suite.** Default journeys:

- **J1, first run (PR1)**: a fresh browser context opens `/`; the prerendered
  dashboard is visible; the onboarding overlay appears only *after* hydration
  (pinning v0.15 PR2's fix in a real browser); completing it lands on a usable
  dashboard; a reload keeps onboarding closed.
- **J2, daily loop (PR2)**: pick a focus and dose, start the plan, check in;
  the progress ring reads 100 percent; a real page reload still reads 100
  percent (pinning PR #90's fix at the page lifecycle it actually lives at).
- **J3, journal (PR2)**: write a gratitude entry on `/journal`; reload; the
  entry is still there and editing it edits in place (one entry per day).

The tripwire: every journey fails on any `console.error` (production React
reports a hydration mismatch this way, as a minified error). A per-message
allowlist may exist but starts **empty**, and every entry added must carry a
reason string - the exact convention `theme-token-guard`'s
`INTENTIONAL_EXCEPTIONS` already uses.

Alternative: more journeys (`/now`, `/trends`, `/breathe`). Declined by
default: `/now` is timer-driven (slow or clock-mocked, both flake sources) and
the point of a smoke suite is to stay fast enough that nobody is tempted to
skip it.

**D2 - runner: `@playwright/test`, chromium only.** In `devDependencies` only;
`dependencies` stays untouched, which keeps `static-export-surface.test.ts`'s
scope note true (it audits `dependencies` only, its module doc line 30).
Alternative: also firefox/webkit. Declined: triples CI time for a smoke suite
whose bugs so far have all been logic-and-lifecycle, not engine-specific.

**D3 - target: the real static export, served the way Pages serves it.** The
suite runs against the `out/` directory of a production `npm run build`,
mounted under `/calm-daily-coach` with trailing slashes - the exact shape of
Fact C - never against `next dev`. Serving mechanics (a tiny static file
server, or `out/` copied into a parent directory so the basePath resolves) are
PR1's to pick; the *contract* is that the browser URL bar reads
`.../calm-daily-coach/` like production. Alternative: test `next dev` for
speed. Declined: it un-tests the prerender/hydrate boundary, which is half the
reason this milestone exists (Fact B).

**D4 - CI placement: runs on every PR and main push, is NOT a required
context.** A new `e2e` job (in `ci.yml` or a sibling workflow, PR1's call)
runs alongside the quality gate, visible red or green on every PR. Branch
protection stays exactly `["lint-and-build"]`. This is Fact D's precedent:
requiredness is earned by observed stability, and flipping a protection
setting is a user-visible act that deserves its own decision once the suite
has history. The job must run on its own PR and be observed both red and green
there before it merges (a gate never seen failing proves nothing).
Alternative: required from day one. Declined: a flaky browser suite as a
required context wedges every PR, the same failure shape the audit gate had.

**D5 - Playwright and vitest never see each other's files.** Playwright specs
live in `e2e/` at the repo root with a Playwright `testDir` pointing there, and
PR1 adds an explicit vitest `exclude` for `e2e/**` (Fact E: vitest's default
glob would otherwise execute them under jsdom). PR1 proves the separation both
ways: the vitest suite count is unchanged by adding specs, and
`npx playwright test --list` shows only `e2e/` files.

**D6 - the PR-template half of the old candidate is dropped from this
milestone.** The "Later / candidates" entry bundled "Playwright E2E smoke test
for the daily loop **plus a PR template**". A PR template is repo hygiene with
no relation to a browser suite; bundling it here would be scope creep by
inheritance. It stays in "Later / candidates" on its own line.

**D7 - no signed-in journeys.** Google OAuth cannot be walked by a headless
browser without real credentials, and secrets never enter tests or CI beyond
what the user sets (`gh secret set`). Signed-in behavior stays covered where it
is today: the RTL suites that drive the real hook and stores (PRs #114, #121,
#123). The E2E suite tests the guest product, which since v0.14 is the product
a stranger actually meets. Alternative: a Firebase Auth emulator journey.
Declined for now: new infrastructure, new flake surface, and the guest path is
where every recent defect lived.

---

## 4. Plan

Two PRs, dependency-ordered (no calendar sizing; the second depends on the
first's harness, nothing else):

- **PR1 - harness plus the first journey.** `@playwright/test` in
  `devDependencies`, `playwright.config.ts` (chromium project, `testDir: e2e`,
  webServer serving the built export under the production basePath), the
  vitest `exclude` for `e2e/**` with both separation proofs, journey J1, the
  console-error tripwire, and the `e2e` CI job with `permissions: contents:
  read`, run red and green on its own PR with run ids recorded. The PR body
  reports the job's added minutes (before/after CI cost, with browser
  caching).
- **PR2 - the daily loop, and the milestone closes.** Journeys J2 and J3,
  `package.json` 0.15.0 → **0.16.0**, and `docs/ROADMAP.md`'s `### v0.16`
  heading flips to DONE **in the same commit** - not a style choice:
  `src/__tests__/roadmap-milestone-status.test.ts` fails when the shipped
  version reaches a milestone whose heading is not terminal.

---

## 5. Done when (checkable)

- [ ] PR1: `@playwright/test` appears in `devDependencies` and nowhere in
      `dependencies`; `static-export-surface.test.ts` still green unmodified.
- [ ] PR1: J1 passes against the production-shaped export (URL carries
      `/calm-daily-coach/`, trailing slash), asserting the overlay is absent
      from the served HTML and appears only after hydration, with the
      console-error tripwire active.
- [ ] PR1: the `e2e` CI job ran on its own PR and was observed BOTH failing
      (real sabotage, run id recorded) and passing (run id recorded); branch
      protection still requires exactly `["lint-and-build"]` (gh api receipt
      in the PR body).
- [ ] PR1: vitest suite count unchanged by the new spec files, and
      `npx playwright test --list` names only `e2e/` files.
- [ ] PR2: J2 (check-in ring survives a real reload) and J3 (journal entry
      survives a real reload, edits in place) pass.
- [ ] PR2: `package.json` reads 0.16.0 and the roadmap heading reads DONE in
      the same commit; `roadmap-milestone-status.test.ts` green.
- [ ] Both PRs: the five pinned gate commands from `.github/workflows/ci.yml`
      (lint, typecheck, build, `npm audit --audit-level=high`,
      `npm run test:coverage`) green.

---

## 6. Product rules

- The suite asserts calm behavior and must never manufacture pressure to test
  it: no journey asserts a streak, a countdown, or an escalation, because none
  may exist (they were removed in PR #73 and the calm-tone guard keeps copy
  honest).
- No new banner, modal, or interstitial is added to the app by this milestone.
  v0.16 adds zero runtime code; if a journey cannot pass without a product
  change, that change is a separate finding, not a rider.
- `dependencies` is untouched; everything new is dev tooling.

---

## 7. Risks (named, not hidden)

- **Flake.** Browser suites flake; that is why D4 starts unrequired and why J1
  is one journey, not ten. Playwright's CI retries default is acceptable, but
  a test that passes only on retry is a bug to fix, not a state to accept.
- **CI minutes.** Chromium download and boot costs real time (~1-2 min
  uncached). PR1 must measure it and use Playwright's browser cache; the
  number goes in the PR body, per the DevSecOps measure-first rule.
- **Tripwire noise.** An unconfigured-Firebase build may log to the console at
  load; if it does, the allowlist gains one documented entry rather than the
  tripwire being disabled. Discovering this is part of PR1, not a surprise.
- **basePath serving.** The `/calm-daily-coach` mount is unusual for local
  static servers; if PR1 fights it, the fallback is copying `out/` into a
  `calm-daily-coach/` subdirectory of a temp dir and serving the parent -
  boring and reliable. What is not acceptable is dropping the basePath to make
  serving easy (that un-tests Fact C).
