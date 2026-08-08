# ADHD Daily Coach - Product Roadmap

Canonical forward roadmap, last audited against real git/gh state 2026-08-07. This
document supersedes the forward-looking sections of docs/FRONTEND_FUNCTIONALITY_PLAN.md,
docs/AUTONOMOUS_IMPLEMENTATION_PLAN.md, and docs/MONETIZATION_PLAN.md; those files remain
as historical records with status banners.

## Direction (user, 2026-07-19)

Development focus is **frontend, UI, and UX**. Backend-leaning work (Stripe webhooks,
entitlement server logic) is explicitly deprioritized until the user redirects; see the
v0.5 entry below. This applies to every milestone in this document, not just the one it
is written next to.

## Versioning convention

- Delivery is PR-based: releases are tracked by merged PR number on `main`, deployed
  automatically to GitHub Pages. There are no git tags.
- package.json has stayed at 0.1.0 since the project started. Starting with the roadmap
  consolidation PR, package.json is bumped once per shipped milestone, targeting roughly
  one minor version per week. In practice this has not been a strict 1:1 sequence: v0.3
  (reminder delivery, PRs #80-#81) shipped without its own bump, so package.json stayed
  at 0.2.0 through v0.3 and moved directly to 0.4.0 when v0.4 shipped. Treat "one bump
  per shipped feature milestone" as the rule, not "every integer gets used."
- Milestones below are sized so each ships as one or two small PRs, matching the
  autonomous one-increment-per-run dev workflow.

## Product rules (non-negotiable, apply to every milestone)

- No infinite feed.
- No streak pressure (streak mechanics were deliberately removed in PR #73).
- Daily dose cap stays enforced.
- Calm, ADHD friendly UX: opt-in nudges only, no guilt or escalation mechanics.

## Current state (2026-08-08)

- App: "ADHD Daily Coach: Your friendly self-improvement coach" (renamed from
  "Focus"; originally Calm Daily Coach, PR #59). Next.js 16 / React 19 TypeScript
  static export on GitHub Pages at https://rodmen07.github.io/adhd-daily-coach/.
  No server routes. **The repo slug rename is DONE** (2026-07-29: the repo and
  the Pages site both return 200 at `adhd-daily-coach`; the old Pages URL 404s,
  because project URLs do not redirect). The localStorage namespace is still
  `calm-daily-coach` and is frozen forever on purpose. The `basePath`,
  `assetPrefix` and the `.ics` app URL are all derived from
  `GITHUB_REPOSITORY` rather than hardcoded, in one shared `site-base-path.mjs`
  that `next.config.ts`, `playwright.config.ts` and `e2e/serve.mjs` all import,
  so the rename needed no code change and the export and the e2e server cannot
  drift apart. That derivation fixes the NEXT build only, which is why the
  rename also needed one manually triggered rebuild: a rename fires no workflow
  event and `deploy-pages.yml` triggers only on `push` to `main` and
  `workflow_dispatch`, so until the rebuild finished Pages served the
  un-rebuilt artifact at the new URL with every asset still on the old prefix.
  For any future rename, see [RENAME_RUNBOOK.md](RENAME_RUNBOOK.md).
- Persistence: since the v0.4 flip (2026-07-19), an unset
  `NEXT_PUBLIC_CHECKIN_BACKEND` resolves to Firestore for signed-in users on
  Firebase-configured deployments and to localStorage otherwise; explicit
  `local|firestore` values still force their mode. Automatic local fallback is
  unchanged. Idempotent guest-to-account migration now covers **all three
  collections**: check-ins since v0.4 (`migrateGuestCheckins`), journal entries
  and focus sessions since v0.13 (PR #113 and PR #115), all three on the shared
  `src/lib/guest-migration.ts` primitive. Signed-out and
  Firebase-less usage stays localStorage-only. Gratitude journal entries (v0.7)
  gained the same adapter in v0.9 (PR #89, hardened in PR #90): the code path
  for signed-in, Firebase-configured sync exists and is tested, reusing this
  same resolution policy with no separate toggle. Live behavior is still
  local-fallback for every real user today because the updated Firestore rules
  have not been published in the console yet (USER-ONLY, see below); once
  published, journal entries sync exactly like check-ins do.
- Monetization: single $5/month membership after a 30-day free trial. Stripe Payment
  Link billing scaffolding shipped in PR #77 (src/lib/billing.ts,
  `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`, `client_reference_id` plus `prefilled_email`
  attribution, mailto fallback). Entitlement flips are manual in Firestore for now, and
  automating that flip (v0.5) is deprioritized per the direction above.
- Quality gate: PR #86 (2026-07-19) consolidated CI into a single required job (lint,
  typecheck, tests, build) so the branch-protection check now actually gates all of
  them; it previously gated only lint and build. **Re-read live 2026-08-08: the
  required contexts are exactly `["lint-and-build", "lighthouse"]`** — the first
  posted by that one consolidated job, the second promoted from observational to
  required on 2026-08-08 after 55 consecutive green runs since it merged. The set
  is now a committed contract in `.github/required-checks.json`, held to the
  workflows by `required-checks-contract` so a required context can never name a
  check some PR never receives.
  **Five** DevSecOps increments have since extended the safety net around it
  (corrected from "two" 2026-08-01: the sentence was written when there were two
  and was never re-counted; four → five 2026-08-08). PR #111 (2026-07-25) added
  `.github/workflows/security-audit.yml`, which runs the gate's own
  `npm audit --audit-level=high` daily; it **gates nothing** and exists because that
  command queries the live advisory database, so it had flipped an unchanged main
  red four times (#99, #101, #102, #107), each time discovered reactively by the
  next PR. PR #119 (2026-07-26) added `src/__tests__/static-export-surface.test.ts`
  after removing the last pre-static-export server code. PR #127 (2026-07-27)
  added `src/__tests__/lockfile-version-parity.test.ts`. PR #136 (2026-08-01)
  added `.github/workflows/lighthouse.yml`, the v0.18 Web Vitals gate, which
  gated nothing by design until 2026-08-08. PR #161 (2026-08-08) promoted it and
  declared the whole contract in `.github/required-checks.json`. The repo now
  carries six workflows in total
  (`ci.yml`, `deploy-pages.yml`, `e2e.yml`, `lighthouse.yml`, `security-audit.yml`,
  `dev-agent-runner.yml`), of which exactly two, `ci.yml` and `lighthouse.yml`,
  post a required context.
  **Twenty** guard tests now
  run inside the gate and compare two sources of truth rather than restating
  either: `theme-token-guard` (widened by PR #128 to the `dark:`-paired shade
  pattern it previously missed), `static-export-surface`, `workflow-audit-parity`,
  `roadmap-milestone-status`, `onboarding-storage-contract`,
  `auth-message-contract` (PR #123), `lockfile-version-parity` (PR #127),
  `lighthouse-baseline-contract` (PR #136), `roadmap-guard-count` (PR #138),
  `firebase-on-demand` (v0.19 PR3, which keeps the SDK out of the
  first-paint bundle structurally), `serve-compression` (v0.20 PR1, which
  spawns the real `e2e/serve.mjs` and proves it negotiates gzip the way GitHub
  Pages does, so the Web Vitals gate measures what a visitor is served), and
  `status-message-guard` (v0.21 PR1, which fails when a `page.tsx` spells an
  error alert inline instead of delegating to the shared `StatusMessage`
  vocabulary), `security-policy-truth` (which reads SECURITY.md against
  package.json and fails when the published security policy claims a version
  the app does not ship), `workflow-secret-usage` (which reads every
  workflow and fails when a step whose body runs nothing is handed a secret
  anyway), `route-registry-guard` (v0.22 PR1, which glob-discovers every
  `src/app` page file and holds the registry, the rendered nav and the chord
  table to it, so a shipped route in no navigation surface fails the gate), and
  `coverage-scope-guard` (which runs Node's own glob matcher over
  `vitest.config.ts`'s `coverage.include` and every shipped module on disk, so
  a source file cannot sit OUTSIDE the report the way the whole of
  `src/app/**` did until 2026-08-07 - absent rather than reported at 0%), and
  `roadmap-version-claim` (v0.23 definition, which reads this section's
  "package.json reads x.y.z" sentence against `package.json` itself, the claim
  that had gone stale four times because the milestone-status guard reads
  headings and never saw it), and `route-door-census` (v0.23 PR1, which reads
  the registry's `inPrimaryNav` entries against every href literal in the
  shipped `src/app` tree with the two navigation surfaces excluded, so a route
  whose only affordance is a header pill fails the gate - six of the twelve
  were in exactly that state when it was written), and `required-checks-contract`
  (2026-08-08, which reads `.github/required-checks.json` against the workflows
  and fails when a context declared required is one some PR never receives -
  `security-audit.yml`'s `paths:`-filtered trigger is the live example, and a
  required context that never arrives wedges that PR with no way out except an
  admin changing the setting), and `css-var-syntax-guard`
  (2026-08-08, which reads every shipped `src/` file against the CSS parser
  itself and fails on the Tailwind v3 `X-[--token]` spelling - v4 compiles it
  to `background-color: --token`, an invalid declaration a browser drops, so
  258 occurrences across 12 files were rendering nothing at all, including
  every visual difference between a playing and a stopped sound on `/ambient`).
  (This count was the file's most reliable staleness generator: written as "five"
  by the v0.15 definition, corrected to "six" by the v0.16 definition after PR
  #123 landed the same evening, corrected to "seven" by the v0.17 definition
  after PR #127 landed within hours of the v0.16 pass, and found stale again on
  2026-08-01 at "seven" when the real count was eight - always in exactly the
  prose the milestone-status guard could not read. **It is no longer prose the
  repo cannot check:** `src/__tests__/roadmap-guard-count.test.ts`, added by the
  v0.19 definition, reads this paragraph and the real filesystem and fails when
  the number word or the list of names disagrees with the guard suites that
  actually exist. A defect that recurs four times is a missing check, not a
  missing reminder, which is the same reasoning that produced
  `roadmap-milestone-status` for the headings.)
- Accessibility: PR #87 (2026-07-20, v0.8) added a global focus-visible ring, a
  skip-to-content link, a reduced-motion reset that covers every animated surface (it
  had previously only covered some), a single layout `<main>` landmark, aria-current
  navigation, and fixed an icon-only checkbox with no accessible name.
- PRs #69 through #77 all merged on 2026-07-18 (highest number is #77; the final merge
  to main that day was #76): automation PR reliability (#69), dev-agent backlog
  hygiene (#70), ReminderSettingsPanel (#71), sync-badge backend-mode fix (#72),
  challenges de-streaking (#73), week-over-week review insight (#74), postcss audit
  override with npm audit now clean (#75), dashboard AffirmationCard (#76), Stripe
  Payment Link (#77).
- All six items of the frontend functionality plan (action rail, onboarding, weekly
  insights, plan editor, browser reminders, offline/sync status) are complete as of
  2026-07-18.
- New surfaces since the 2026-07-18 snapshot above (this bullet last extended
  2026-08-07): `/trends`, a 4-week
  check-in insight view (v0.11, PR #96/#97), and `/now`, the "one thing now"
  calm focus-session timer (NF-6, PR #104) backed by a local-first
  `src/lib/focus-session.ts` store. v0.12 shipped the same day (PR #109 + PR
  #110): `/trends` now carries a "Focus sessions this week" card and sessions
  optionally sync to `users/{uid}/focusSessions`. v0.13 shipped the same day too
  (PR #113 + PR #115): guest-to-account migration for journal entries and focus
  sessions on a shared primitive. v0.14 followed on 2026-07-26 (PR #117 + PR
  #118 + PR #121) and opened the app to signed-out visitors, which is what makes
  v0.13's migration reachable at all. v0.15 closed the same day (PR #123 + PR
  #124) and added no surface at all: it made the first-run path a stranger now
  reaches behave - one shared sign-in alert on all three sign-in surfaces, and
  an onboarding gate whose first client render matches the prerender. v0.16
  (PR #126 + PR #129) added no page either but the repo's first surface outside
  jsdom: a four-journey Playwright smoke suite (`e2e/`) driven by real chromium
  against the real static export, with its own non-required `e2e` CI job.
  v0.17 (PR #131 + PR #132, 2026-07-27) added no page either: it extended
  guest-to-account migration to slicer task history and to today's plan, so
  signing in no longer empties the workspace a guest built. v0.18 (PR #136,
  2026-08-01) added the repo's first performance measurement, a Lighthouse CI
  job with its own non-required `lighthouse` context. v0.19 (PR #139, #140,
  #141, #143, #145, 2026-08-01 to 2026-08-05) took the entry route from CLS
  0.752 to 0.000 and entry script transfer from 1.69 MB to 780,860 B. v0.20
  (PR #148 + PR #149, 2026-08-07) made the Web Vitals gate measure what a
  visitor is actually served, gzip and all, and widened it to `/pricing/`.
  v0.21 (PR #152 + PR #153, 2026-08-07) added no page either: it put every
  page-level transient status behind one `StatusMessage` primitive whose
  politeness is derived from its tone, and gave `/now` and `/trends` the
  migration error branch they never had. v0.22 (PR #156 + PR #157, 2026-08-07)
  added no page either: it collapsed the four independent route lists into one
  `src/lib/routes.ts` registry, put `/now` in the primary nav and the `g n`
  chord, and moved `/monetization` out of the front door without deleting it.
  PR #158 (2026-08-08, QA stream) then widened `vitest.config.ts`'s
  `coverage.include` from `src/lib/**` to the whole source tree, so the
  coverage number describes the app rather than one layer of it; the headline
  function figure fell 96.12% to 83.58% on the measurement change alone, with
  no code change. v0.23 (PR #160 + PR #162, 2026-08-08) added no page either
  but changed the front door twice: PR1 gave the six routes that were reachable
  only from the header a contextual dashboard door and a census guard that
  fails CI if one loses it again, and PR2 collapsed the header itself from
  twelve pills wrapping to four rows to three inline links plus a native
  "More" disclosure - **264 px to 138 px at 375x667 (39.6% to 20.7% of the
  viewport) and 180 px to 67 px at 1280x720**, measured in chromium against the
  real export by `e2e/nav-shape.spec.ts`. v0.24 (PR #164 + PR #166,
  2026-08-08) added no page either but finished that front door: PR1 gave the
  registry a `navGroup` field, turning the nine undifferentiated items behind
  "More" into four labelled lists in the panel and the same four headings in
  the keyboard dialog, and gave the five chordless primary-nav routes a chord;
  PR2 made the disclosure behave like a menu, so `Escape` closes it and returns
  focus to its summary and a pointer-down outside dismisses it - the one cost
  `NAV_SHAPE.md` D4 recorded rather than hid when it chose a native
  `<details>`. **package.json reads
  0.24.0** (this sentence read "0.16.0" until 2026-08-01, two milestones stale,
  then "0.18.0" until 2026-08-07, three milestones stale, then "0.21.0" until
  2026-08-08, one milestone stale - the v0.22 definition corrected it on
  2026-08-07 and v0.22 itself shipped hours later and made it wrong again. It
  has been correct on every milestone since, because the guard below now fails
  the PR that would leave it stale rather than waiting for a reader.
  It was the one claim in this bullet that the milestone-status guard already
  checks from the other direction, via the headings, which is why the headings
  were right the whole time this sentence was wrong. **Four recurrences is a
  missing check, not a missing reminder** - the same reasoning that produced
  `roadmap-milestone-status` for the headings and `roadmap-guard-count` for the
  sentence below - so the v0.23 definition shipped
  `src/__tests__/roadmap-version-claim.test.ts`, which reads this section
  against `package.json` and went red on this very sentence before correcting
  it. There is no fifth recurrence available.)
- Access (corrected 2026-07-26 by v0.14): **the app is open to a signed-out
  person on every route.** Until v0.14 it was not - `subscription-guard.tsx`
  answered `!authUser` with a full-screen "Sign in required" wall via
  `layout.tsx`, so the deployed build showed a visitor no product at all, which
  contradicted the local-first stores, the `GUEST (LOCAL)` header badge, and
  v0.13's whole purpose. The gate now blocks exactly one thing: a SIGNED-IN
  account that is out of entitlement (trial finished and not subscribed, or
  explicitly `"expired"`), and `/pricing` is exempt so that screen's Subscribe
  link reaches checkout. Signing in is an upgrade to sync and backup, offered by
  the in-page buttons on `/`, `/focus`, and `/pricing` that no signed-out
  visitor could previously reach.
- The repo also hosts a Python dev-agent pipeline in agents/dev-agent/ (backlog ids
  cdc-001 through cdc-016). Roadmap items may reference cdc ids, but files under
  agents/dev-agent/ must never be edited by roadmap work.

## Next milestones

### v0.2 - Roadmap consolidation and reminder delivery design (DONE)

Resets the paper trail to reality and unblocks v0.3 and v0.5 with the design decisions
they wait on. All items agent-doable now.

- This document plus status banners on the three legacy planning docs and a one-line
  README pointer (1 PR). Bump package.json to 0.2.0 in the same PR and keep the
  versioning convention stated above.
- Reminder scheduling design doc: enumerate GitHub Actions cron plus email, client-side
  Web Notifications, and Firebase Functions options with cost, privacy, and calm-UX
  tradeoffs; ship as a docs-only PR for user review (1 PR).
- Done when: ROADMAP.md and banners are merged, package.json reads 0.2.0, and the
  reminder design doc is merged and awaiting user sign-off.
- DONE (2026-07-19, PR #78 + PR #79): this document plus the legacy-doc banners and
  the README pointer shipped in #78 with package.json bumped to 0.2.0, and the
  reminder scheduling design doc shipped in #79.

### v0.3 - Reminder delivery v1 (DONE)

- Design doc: [docs/design/REMINDER_SCHEDULING.md](design/REMINDER_SCHEDULING.md) scores the delivery options and proposes the phased plan this milestone implemented.
- DONE (2026-07-19, PR #80 + PR #81): the approved delivery mechanisms shipped behind
  the existing ReminderSettingsPanel channel choice - a deterministic RFC 5545 `.ics`
  calendar channel (#80) and an OS Notification API channel with strict opt-in
  permission UX and a drift cap (#81).
- Keep the "nothing is sent automatically" copy truthful: update copy, README, and
  reminder tests to match the shipped behavior exactly.
- Product rules apply: reminders stay opt-in, single daily nudge, no escalation or
  guilt mechanics.
- Done when: an opted-in user receives exactly one daily nudge via the chosen channel
  and all reminder copy matches actual behavior.

### v0.4 - Sync by default: Firestore flip with safe fallback (DONE, one USER-ONLY item outstanding)

The adapter, migration, and honest sync badge (PR #72) already exist, so the flip is
small and testable. Agent-doable now, except the listed USER-ONLY item.

Status (verified 2026-07-25): agent-side work shipped as PR #82 (merged
2026-07-19); the USER-ONLY console items below are still outstanding, which is
why live behavior is local-fallback for every real user today.

- DONE (2026-07-19): flipped the `NEXT_PUBLIC_CHECKIN_BACKEND` default with a safe
  resolution matrix (unset resolves to `firestore` only when Firebase config is
  present AND the user is signed in, `local` otherwise; explicit `local` still forces
  local), kept the existing automatic local fallback, and added migration notes plus
  a rollback lever (repository variable `NEXT_PUBLIC_CHECKIN_BACKEND=local`, inlined
  by deploy-pages.yml) to the README.
- DONE (2026-07-19): sync-badge and fallback tests extended for the new default
  (CLOUD SYNCED, SYNC OFF (LOCAL), SIGNED IN (LOCAL) states plus the resolution
  matrix and Firestore write/read/migration fallback paths).
- DONE (2026-07-19): Firestore security rules for `users/{uid}` and
  `users/{uid}/checkins` documented in docs/FIRESTORE_RULES.md (docs only;
  deploying the rules in the Firebase console is USER-ONLY).
- USER-ONLY: confirm Firebase project quotas and billing before the default flip goes
  live, and publish the documented security rules in the Firebase console.
- Done when: a fresh deploy defaults to Firestore sync for signed-in users, falls back
  to local cleanly when Firestore is unreachable, and the security rules doc is merged.

### v0.5 - Entitlement: webhook design and client-side membership state (DEPRIORITIZED)

**Status (2026-07-19): DEPRIORITIZED.** The user's frontend/UI-UX direction (see
"Direction" above) explicitly deprioritizes backend-leaning work including this
milestone. The version number 0.5 stays reserved for it; nothing below is scheduled
until the user redirects. This is why the old v0.9 ("paid-value expansion," gated on
this milestone's approval) has been re-slotted; see v0.9 below.

Monetization ladder step 4. The static site cannot receive Stripe webhooks, so
automation needs a design doc first; meanwhile the client can honestly read the
manually-set entitlement.

- Stripe webhook entitlement automation design doc ONLY: Firebase Functions (or
  equivalent) receiver mapping `client_reference_id` to `users/{uid}.subscriptionStatus`,
  with cost estimate and failure modes; docs PR for user review (1 PR).
- Client-side entitlement read: dashboard membership panel reads `subscriptionStatus`
  from `users/{uid}` in Firestore with graceful local fallback and calm expired-state
  copy (1 PR).
- USER-ONLY: create the $5/month Stripe Payment Link and set repository variable
  `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`.
- USER-ONLY: flip `subscriptionStatus` to "active" in Firestore for real payments until
  webhook automation ships.
- Done when: the design doc is merged for review and the dashboard reflects real
  Firestore entitlement state with calm fallback copy.

### v0.6 - Calm UX polish from the dev-agent backlog (DONE)

Burns down pending cdc items that fit the product rules, keeping the autonomous
pipeline fed with small well-scoped work. Agent-doable now. Reference cdc ids in PR
bodies but never edit agents/dev-agent/ files.

- DONE (2026-07-19, v0.6 PR1): wired the already-built ProgressRing component
  (cdc-003; cdc-015 was closed as its duplicate) into the dashboard today spotlight.
  It shows today's loop progress only (plan set is halfway, check-in submitted is
  complete), honors prefers-reduced-motion by rendering the final value with no
  fill animation, and keeps the zero state calm and inviting.
- DONE (2026-07-19, v0.6 PR2): keyboard shortcut help modal (cdc-004) plus
  empty-state illustration component (cdc-012). The header "?" button or the ?
  key opens an accessible dialog (focus trap, Escape, reduced-motion aware)
  listing only real shortcuts, including new "g then d/f/e/r" go-to chords that
  never fire while typing. A reusable CalmEmptyState component with hand-drawn
  inline SVG art now covers Execute (no plan), Review (no check-ins), and the
  Slicer history list.
- Backlog hygiene note: the PR #70 hygiene pass already closed cdc-010 (tag filter
  chips) and cdc-016 (scroll-to-top) as duplicates of cdc-007 and cdc-006, which stay
  pending. Skip any infinite-scroll-adjacent items as product-rule violations.
- Done when: both feature PRs are merged with tests and no product rule is violated.

### v0.7 - Gratitude journal (DONE)

Agent-doable now. A single small PR, matching the one-or-two-PR milestone size.

- DONE (2026-07-19): gratitude journal entry form (cdc-014) at /journal as a
  bounded reflection surface. Entries are keyed by local calendar date so
  exactly one exists per day; after saving, the editor becomes a read view of
  today's entry with a gentle note, and editing updates that same entry in
  place. A soft prompt rotates deterministically by date. History is a finite
  newest-first list revealed in chunks of 7 ("Show earlier entries"), with a
  CalmEmptyState journal variant when empty; no streaks, counters, badges, or
  missed-day mechanics anywhere. Persistence is localStorage-only scoped per
  user (the slicer pattern); Firestore sync is deliberately deferred to
  "Later / candidates" rather than half-wired. Shipped with a header nav link,
  a "g then j" go-to chord listed in the keyboard help modal, and package.json
  bumped to 0.7.0.
- Done when: the journal PR is merged with tests and the surface enforces the
  one-entry-per-day bound.

### v0.8 - Accessibility, focus-state, and reduced-motion pass (DONE)

Scheduled QA-stream audit (see "Standing streams" in the backlog), landed as a
milestone since it touched every interactive surface in the app.

- DONE (2026-07-20, PR #87): global focus-visible ring replacing two ad hoc rules,
  a skip-to-content link, a reduced-motion reset covering every inline Tailwind
  `animate-*`/`transition-*` class (the old block missed the dashboard counters,
  slicer confetti/bounce/ping, breathe pacer, sync-badge pulse, and
  subscription-guard spinner), a single layout `<main id="main-content">` (was 7
  duplicate per-page mains), aria-current navigation via a new `site-nav.tsx`, and a
  real accessibility bug fixed (the slicer step-toggle checkbox had no accessible
  name when unchecked). 249 to 257 tests. package.json bumped to 0.8.0.
- Worth an eyeball live: the subscription-guard spinner freezes under reduced
  motion (expected behavior, but confirm it does not read as stuck).
- Done when: the PR is merged with tests and no new interactive surface regresses
  keyboard reachability or a visible focus state.

### v0.9 - Gratitude journal Firestore sync (DONE)

Re-slotted 2026-07-20: the previously-defined v0.9 ("paid-value expansion design
doc") was gated behind v0.5 entitlement-design approval, which is itself
deprioritized per the direction above with no re-approval date, so it was not a
real next milestone. This replacement has no backend/entitlement dependency: it
extends the same client-side Firestore pattern v0.4 already shipped
(`src/lib/firestore-checkins.ts` calls the `firebase/firestore` client SDK
directly, no server component) to the gratitude journal, which had been
localStorage-only since v0.7 by deliberate, documented choice pending exactly this
work.

Full design, safety argument, scope boundaries, and the candidates considered
against it: [docs/design/JOURNAL_FIRESTORE_SYNC.md](design/JOURNAL_FIRESTORE_SYNC.md).

- DONE (2026-07-20, PR #89): `src/lib/firestore-journal.ts` (client SDK only,
  upsert-by-date-key against `users/{uid}/journal/{entryId}`) plus
  `src/lib/journal-store.ts`, a backend-resolution adapter reusing
  `resolveCheckinBackend` / `NEXT_PUBLIC_CHECKIN_BACKEND` directly (no new env
  var), with local / firestore / firestore-fallback semantics mirroring
  `checkin-store.ts`. `docs/FIRESTORE_RULES.md` gained the
  `users/{uid}/journal/{entryId}` match block (owner-only read/create/update,
  delete denied). `src/app/journal/page.tsx` was rewired to create its store
  via `createJournalStore` and route load/save through the async adapter
  (a pre-merge verification pass found the adapter had been built but never
  wired into the page, and the fix landed in the same PR before merge).
  package.json bumped to 0.9.0.
- DONE (2026-07-20, PR #90, QA hardening pass): added the missing
  firestore-fallback test coverage, fixed a stale module docstring, and added
  a malformed-document field-presence check to `listFirestoreJournalEntries`
  (dates/text validated before use, matching `firestore-checkins.ts`'s
  existing pattern) with a new direct-SDK-mock test file proving the skip.
  261 to 267 tests total.
- Guest-to-account journal migration stayed explicitly out of scope, matching
  the design doc.
- USER-ONLY, does not block anything already merged: publishing the updated
  ruleset in the Firebase console is still outstanding. Until then, journal
  writes hit the currently-live rules (no journal match block yet), and the
  adapter's fallback-on-error path keeps entries on localStorage exactly as
  they behave today - no data loss, no visible breakage.
- Done when: the adapter and resolution tests pass (mirroring
  `checkin-store.test.ts`'s coverage of local/firestore/fallback/override), the
  rules doc is updated, and `npm run lint`, `npm run typecheck`, `npm test`, and
  `npm run build` are green on the quality-gate check. **Confirmed met**: all
  four conditions verified green on PR #89 and re-verified on PR #90.

### v0.10 - Theme consistency: close light/dark rendering gaps + regression guard (DONE)

Defined 2026-07-20 (product-role increment) after auditing the backlog's
unscheduled candidates - a performance pass, general polish, Playwright E2E -
and finding none of them milestone-shaped as worded (see the design doc's
section 1 for why each was set aside). Reading the app's actual theming
architecture (`globals.css` plus every route's real markup) against itself
found real, currently-shipped light/dark rendering defects instead of a
hypothetical polish target.

Full audit, technical plan, and done-when:
[docs/design/THEME_CONSISTENCY.md](design/THEME_CONSISTENCY.md). Every choice
in that document is an explicitly flagged, overridable default, not a hard
review gate.

- DONE (2026-07-20, PR #93): fixed all five (not three - the audit found a
  5th live occurrence while sweeping the whole `hover:bg-slate-800` surface)
  nav-button hover-contrast occurrences, made `subscription-guard.tsx`
  theme-aware (the one genuine product call in this milestone) and added a
  new `--accent-foreground` token after a pre-merge check caught the Subscribe
  button still hardcoding low-contrast text, fixed `focus/page.tsx`'s
  hardcoded `bg-white/70` callout, and added
  `src/app/__tests__/theme-token-guard.test.ts` as the new regression guard.
  296 tests (was 267). package.json bumped to 0.10.0.
- DONE (2026-07-20, PR #94, QA hardening pass): fixed a live instance of the
  guard's target defect class in `MeditationList.tsx` (inline `style` colors,
  invisible to the guard's className-only regex), corrected the guard's
  undercounted baseline-debt figure with a self-checking
  `BASELINE_DEBT_TOTAL` constant, and corrected THEME_CONSISTENCY.md's
  unsound `dark:`-exemption claim (this app's `dark:` tracks
  `prefers-color-scheme`, not the in-app theme toggle, so nothing was
  actually being wrongly exempted). 304 tests.
- Fix three `hover:bg-slate-800` occurrences (`ambient/page.tsx`,
  `breathe/page.tsx` x2, `challenges/page.tsx`) that read fine in dark mode
  but produce near-invisible dark-on-dark hover contrast in light mode.
- Resolve `subscription-guard.tsx`'s fixed-dark paywall screen one way or the
  other (default: make it theme-aware using the app's existing tokens;
  overridable: keep it deliberately fixed-dark as a recorded decision) - the
  one genuine product call in this milestone.
- Fix `focus/page.tsx`'s hardcoded `bg-white/70` callout nested in an
  otherwise theme-token-driven card.
- Add a regression-guard test that reads the app's literal color-class usage
  and `globals.css`'s override allowlist as two sources that must agree, so a
  future page can't silently ship broken in one theme the way these three did.
- Explicitly out of scope for v0.10 (keeps this a small, well-scoped
  milestone): migrating the ~70 already-covered `text-slate-700`-style
  literals to the `--token` system wholesale. They render correctly in both
  themes today via the existing override list; that's a nice-to-have
  cleanup, not a currently-broken surface.
- Done when: all three named fixes land, the new guard test exists and is
  verified to actually fail against the pre-fix state, and `npm run lint`,
  `npm run typecheck`, `npm test`, and `npm run build` are green on the
  quality-gate check. package.json bumps to 0.10.0 in the implementation PR,
  not in this definition. **Confirmed met**: all conditions verified green on
  PR #93 and re-verified on PR #94.

### v0.11 - Trends: a longer-horizon insight view (DONE)

Defined 2026-07-20 (product-role increment). Every "trend" the app shows
today is a single rolling 7-day window compared against the prior 7 days
(`getWeekOverWeekChange` in
[src/lib/review-insights.ts](../src/lib/review-insights.ts)); the underlying
check-in history is retained in full (locally and in Firestore) but nothing
reads more than fourteen days of it. This milestone is a genuinely new
surface - a `/trends` page - not a polish pass on an existing one, and it
was chosen over four other candidates (cross-device continuity's one
remaining gap, reminder-reach expansion via push notifications, planner
forward-planning, and journal/check-in cross-referencing) specifically
because it needed no new backend, no new Firestore rule, and no console
gate to be agent-doable right now. See the full audit, technical plan, and
done-when in
[docs/design/TRENDS_OVER_TIME.md](design/TRENDS_OVER_TIME.md); every choice
in that document is an explicitly flagged, overridable default.

- Add a 28-day (4-week) trend summary read through the existing
  `CheckinStoreAdapter` (`src/lib/checkin-store.ts`), never through a direct
  `browser-checkins.ts` call - see the design doc section 2 for a real bug
  found in `review/page.tsx` that took the direct-call shortcut and silently
  shows empty data for signed-in Firestore users as a result (filed in the
  backlog `## Bugs` section, not fixed by this milestone).
- New `src/lib/trend-insights.ts`: weekly bucketing, overall completion rate,
  dose distribution, and a calm narrative with no streak-shaped language.
- New `/trends` page (nav link + `g` then `t` keyboard chord), reusing
  existing CSS primitives (`progress-track`, `summary-card`, `focus-row`) and
  the existing `CalmEmptyState variant="insights"` - no new chart library, no
  new illustration.
- Done when: the done-when checklist in
  [docs/design/TRENDS_OVER_TIME.md section 5](design/TRENDS_OVER_TIME.md#5-done-when-checkable)
  is fully met and `npm run lint`, `npm run typecheck`, `npm test`, and
  `npm run build` are green on the quality-gate check. package.json bumps to
  0.11.0 in the implementation PR, not in this definition.
- DONE (2026-07-20, PR #96): shipped `/trends` as a 4-week check-in view -
  `getCheckinsInRange` on `CheckinStoreAdapter` (never a direct
  `browser-checkins.ts` call, exactly as the design doc required),
  `src/lib/trend-insights.ts`, the new page with its `g` then `t` chord, all
  reusing existing CSS primitives with no new chart library. 331 tests (was
  304). package.json bumped to 0.11.0. **Confirmed met**: the four gate
  commands verified green on the PR before merge.
- DONE (2026-07-20, PR #97, QA a11y audit): promoted the three visually-styled
  `/trends` subheadings from `<p>` to real `<h2>` so screen-reader heading
  navigation works, with regression tests; the other five audit areas (bar
  text alternatives, keyboard reach, reduced motion, contrast, empty-state
  announcement) were checked and confirmed clean, not invented as issues.

### v0.12 - Focus in Trends: surface focus sessions + optional sync (DONE)

Defined 2026-07-25 (product-role increment). Since the last product pass,
**NF-6 "one thing now"** (`/now`, PR #104) shipped a calm single-task focus
timer with a local-first `src/lib/focus-session.ts` store that already exposes
a pure `summarizeFocusSessions()`. That summary is only shown on `/now`; the
`/trends` page - where a person goes to see "how has my week been" - reads
check-ins exclusively and imports nothing from the focus-session module
(verified by grep 2026-07-25). This milestone closes that gap and was filed as
backlog item NF-6b on 2026-07-23. It was chosen over reminder-reach via FCM
(multiple USER-ONLY gates, not agent-doable now), a performance pass (no
web-vitals baseline exists to make "faster" checkable), Playwright E2E (a QA
item), and the mailer.ts dead-code removal (a hygiene cleanup, not a
user-visible milestone). Full audit, plan, and done-when:
[docs/design/FOCUS_IN_TRENDS.md](design/FOCUS_IN_TRENDS.md); every choice in
that document is an explicitly flagged, overridable default.

- PR1 (frontend only, ships first): add a calm "Focus sessions this week" card
  to `/trends` reading `summarizeFocusSessions`'s `sessionsThisWeek` +
  `minutesThisWeek`, neutral zero state, reusing existing `summary-card` /
  `focus-row` primitives - no new chart library, no streak/target/rate. Local
  read, matching how `/now` reads today.
- PR2 (optional Firestore sync, BaaS-only): new
  `src/lib/firestore-focus-sessions.ts` + `src/lib/focus-session-store.ts`
  mirroring the v0.9 journal pattern (`firestore-journal.ts` +
  `journal-store.ts`), resolving the backend through the existing
  `resolveCheckinBackend` / `NEXT_PUBLIC_CHECKIN_BACKEND` policy with a tested
  local fallback (no new env var), plus a `users/{uid}/focusSessions/{sessionId}`
  block in `docs/FIRESTORE_RULES.md`. Guest-to-account migration is out of
  scope, matching how v0.9 scoped journal migration out. Publishing the ruleset
  in the Firebase console stays USER-ONLY and does not block the code (local
  fallback keeps sessions working until then, exactly like the journal today).
- Product rules enforced by design: no streak, no target, no completion rate,
  no "you skipped" record on the Trends card; a copy-guard test enforces it,
  matching NF-6's own guard.
- Done when: the done-when checklist in
  [docs/design/FOCUS_IN_TRENDS.md section 5](design/FOCUS_IN_TRENDS.md#5-done-when-checkable)
  is met and `npm run lint`, `npm run typecheck`, `npm test`, and
  `npm run build` are green on the quality-gate check. package.json bumps to
  0.12.0 in the first implementation PR, not in this definition.
- DONE (2026-07-25, PR #109, PR1): `/trends` renders a "Focus sessions this
  week" card on the existing `summary-card` / `summary-grid` primitives, with
  its recap sentence composed inside `focus-session-copy.ts` so the calm-tone
  guard reads the sentence a person actually sees. It also stands alone for
  someone who has used `/now` but never checked in, whose sessions were
  previously invisible behind the check-in empty state. 360 tests (was 352).
  package.json bumped to 0.12.0.
- DONE (2026-07-25, PR #110, PR2): `src/lib/firestore-focus-sessions.ts` +
  `src/lib/focus-session-store.ts` mirror the v0.9 journal pattern, resolving
  through the existing `resolveCheckinBackend` policy with no new env var; the
  locally generated session id is also the Firestore document id, so a retried
  write cannot duplicate a session. Both `/now` and `/trends` were wired
  through the adapter in the same PR. `docs/FIRESTORE_RULES.md` gained the
  `users/{uid}/focusSessions/{sessionId}` block (read + create only; update and
  delete denied). 376 tests (was 360). Publishing that ruleset in the console
  remains USER-ONLY and blocks nothing that shipped.

### v0.13 - Bring your data with you: guest-to-account migration (DONE)

**DONE 2026-07-25**, both PRs merged and deployed:

- PR1 [#113](https://github.com/rodmen07/calm-daily-coach/pull/113): the copy
  loop extracted out of `checkin-store.ts` into a collection-agnostic
  `src/lib/guest-migration.ts` (the check-in migration tests passed unchanged,
  which is what makes the refactor behavior-preserving rather than merely
  claimed), plus `migrateGuestJournalEntries` wired into `/journal`.
  package.json bumped to 0.13.0.
- PR2 [#115](https://github.com/rodmen07/calm-daily-coach/pull/115):
  `migrateGuestFocusSessions` wired into `/now` and `/trends`, plus the one
  calm result line. New by-id writers (`putFocusSession`,
  `putFirestoreFocusSession`) copy an already-stamped session verbatim instead
  of restamping it, so a session run last week is not refiled under today.
- The conflict rule shipped as an OPT-IN guard per collection (journal in,
  check-ins and focus sessions out) rather than retro-applied to every
  collection as the design doc's D3 text says, because both of those
  collections are append-only and a date-identity rule there would delete guest
  records rather than protect account ones. That divergence is deliberate,
  tested, and awaiting user confirmation before
  [docs/design/GUEST_DATA_MIGRATION.md](design/GUEST_DATA_MIGRATION.md) is
  edited to match.
- **Caveat recorded 2026-07-25, not a defect in this milestone:** on the
  deployed build a person cannot create data while signed out at all, because
  the subscription gate requires a Google account for every route. So the
  user-visible value of this milestone is unreachable in production until v0.14
  below decides what a signed-out person gets.

Original definition follows.


Defined 2026-07-25 (product-role increment), the milestone after v0.12. Verified
by reading the code rather than the changelog: `src/lib/checkin-store.ts` has
shipped an idempotent `migrateGuestCheckins` since v0.4, but
`src/lib/journal-store.ts` and `src/lib/focus-session-store.ts` each carve
migration out **in their own module docs** ("Explicitly out of scope for v0.9"
and "Explicitly out of scope for v0.12"). So a person who journals or runs a
`/now` focus session signed out, then signs in, sees an empty journal and a
zeroed focus card while their entries sit intact in guest-scoped localStorage -
even though their check-ins follow them across. The app is inconsistent about
its own promise, and this is the third time the gap has been deferred in
writing.

Chosen over reminder reach via FCM (still USER-ONLY console gates), a
performance pass (still no web-vitals baseline to make "faster" checkable),
Playwright E2E (QA-stream work), and the `mailer.ts` dead-code removal
(hygiene, not a user-visible milestone). Frontend/BaaS-only: no new env var, no
new Firestore collection, no new security rule, no new console gate. Full
audit, plan, and done-when:
[docs/design/GUEST_DATA_MIGRATION.md](design/GUEST_DATA_MIGRATION.md); every
choice in that document is an explicitly flagged, overridable default.

- PR1 (ships first): extract the guest-to-account copy loop out of
  `checkin-store.ts` into a collection-agnostic `src/lib/guest-migration.ts`,
  refactor check-ins onto it **behavior-preservingly** (the existing check-in
  migration tests must pass unchanged), then add `migrateGuestJournalEntries`
  to `journal-store.ts` across all three backend branches and wire `/journal`
  to run it once on first signed-in load. package.json bumps to 0.13.0 here.
- PR2: the same primitive for focus sessions in `focus-session-store.ts`,
  wired into `/now` and `/trends`, plus one calm result line reusing the
  existing `migrationStatus` channel rather than a new toast surface.
- Conflict rule (a real hazard the audit found, not a hypothetical): the
  journal's `saveJournalEntry` upserts by date, so a naive copy of the
  check-in migration would silently overwrite an account entry with a guest
  entry written on the same day. Account data wins; a guest record whose
  identity key already exists is skipped, never merged and never written over.
- Product rules apply: silent when there is nothing to move, no counts framed
  as targets, no "you missed" language, and a failure is calm and
  non-destructive (the guest copy is never deleted).
- Done when: the done-when checklist in
  [docs/design/GUEST_DATA_MIGRATION.md section 5](design/GUEST_DATA_MIGRATION.md#5-done-when-checkable)
  is met and `npm run lint`, `npm run typecheck`, `npm run test:coverage`,
  `npm run build`, and `npm audit --audit-level=high` are green on the
  quality-gate check. package.json bumps to 0.13.0 in the first implementation
  PR, not in this definition.

### v0.14 - Let people in: guest access and a reachable checkout (DONE)

**DONE 2026-07-26**, three PRs merged and deployed:

- PR1 [#117](https://github.com/rodmen07/calm-daily-coach/pull/117): the gate is
  route-aware and exempts `/pricing` unconditionally (D2), through the shared
  `src/lib/route-path.ts` so the trailing-slash form the static export actually
  serves matches the bare route the allowlist is written with. A blocked
  account's only call to action now leads somewhere.
- PR2a [#118](https://github.com/rodmen07/calm-daily-coach/pull/118):
  `subscriptionStatus === "expired"` blocks on its own terms (D5) and
  `getTrialDaysRemaining`'s documented contract matches its behavior (D6), both
  through new `src/lib/entitlement.ts` - one shared answer to "what does this
  account get", replacing the two copies of that arithmetic that disagreed in
  production on a malformed `createdAt`.
- PR2 [#121](https://github.com/rodmen07/calm-daily-coach/pull/121): **the
  `!authUser` wall is gone (D1, approved by the user 2026-07-26)**. Every route
  renders for a signed-out person, ahead of the account read rather than after
  it, so the prerendered HTML of the static export carries the page instead of
  the "Loading account details..." spinner it used to ship. The membership is
  unchanged for signed-in accounts (D4). package.json bumped to 0.14.0.
- All four filed bugs this milestone targeted are closed: two HIGH (no guest
  mode; the paywall's only CTA behind the paywall), one MED (dead `"expired"`
  status), one LOW (`getTrialDaysRemaining` returning NaN for a malformed date).
- Accepted consequence, stated by the design doc and confirmed by the user: a
  lapsed subscriber can sign out and keep using the local app. The membership
  sells sync and backup, not the ability to run a timer.

Original definition follows.

Defined 2026-07-25 (product-role increment), the milestone after v0.13.

`src/app/components/subscription-guard.tsx:85-86` renders a full-screen "Sign in
required" wall whenever `authUser` is null, and `layout.tsx:79` wraps every one
of the app's thirteen pages in it, so the deployed site shows a signed-out
visitor no product at all. Everything else is built as if guests existed: the
stores resolve to localStorage when signed out, the header badge (which sits
OUTSIDE the gate) advertises `GUEST (LOCAL)`, three in-page "Continue with
Google" buttons already exist on `/`, `/focus`, and `/pricing` that no
signed-out visitor has ever been able to reach - and v0.13, shipped the same
day this was written, migrates data a person creates *while signed out*.

Separately and independently of that question, the trial-ended screen's only
call to action links to `/pricing`, which the same gate blocks, so an
expired-trial account can never reach checkout. That half is wrong under every
reading and ships first.

Chosen over reminder reach via FCM (still USER-ONLY console gates), a
performance pass (still no web-vitals baseline to make "faster" checkable),
Playwright E2E (QA-stream work, and a suite written now would encode the
behavior this milestone changes), the `mailer.ts` dead-code removal (hygiene),
and extending guest migration to planner state and slicer history (cheap now,
but it deepens a feature the front door makes unreachable - ordering matters).
Frontend-only: no new env var, no new Firestore collection, no new security
rule, no new console gate. Full audit, plan, and every overridable default:
[docs/design/GUEST_ACCESS_AND_PAYWALL.md](design/GUEST_ACCESS_AND_PAYWALL.md).

- PR1 (ships first, independent of the product decision): make the gate
  route-aware and exempt `/pricing` unconditionally, using the same
  `usePathname` mechanism `site-nav.tsx` already uses. **The package.json bump
  moves to PR2** (see the note below).
- PR2a (2026-07-26, ships ahead of the decision because it is correct under
  either answer): `subscriptionStatus === "expired"` now blocks on its own terms
  (D5), and `getTrialDaysRemaining`'s documented contract matches its behavior -
  the unreachable `catch` deleted, the NaN return documented, the return value
  unchanged (D6). Both land through new `src/lib/entitlement.ts`, one shared
  answer to "what does this account get", replacing the copy of that arithmetic
  the gate and the dashboard's membership card each kept. The copies disagreed
  in production on a malformed `createdAt`: the gate admitted the person while
  the card told them their trial had ended.
- PR2 (carries decision D1, default = restore guest access): remove the
  `!authUser` wall so every route renders for a guest; flip the one remaining
  documenting test in `src/app/components/__tests__/subscription-guard.test.tsx`
  into an assertion of the new behavior; bump `package.json` to 0.14.0.
- Closes four filed bugs: two HIGH (no guest mode; the paywall's only CTA is
  behind the paywall), one MED (dead `"expired"` status), one LOW
  (`getTrialDaysRemaining` returns NaN for a malformed date).
- Product rules apply: this milestone only removes blocking surfaces. No new
  banner, modal, countdown, or nag replaces the wall - the sign-in invitation
  stays where it already is, phrased as an upgrade.
- Done when: the done-when checklist in
  [docs/design/GUEST_ACCESS_AND_PAYWALL.md section 5](design/GUEST_ACCESS_AND_PAYWALL.md#5-done-when-checkable)
  is met, no test in `subscription-guard.test.tsx` still describes a shipped
  defect as expected behavior, and `npm run lint`, `npm run typecheck`,
  `npm run build`, `npm audit --audit-level=high`, and `npm run test:coverage`
  are green on the quality-gate check.
- Version bump, corrected in PR1 (2026-07-25): package.json moves to 0.14.0 in
  **PR2**, the PR that completes the milestone, not in PR1. Bumping in the
  first slice of a two-PR milestone is what earlier milestones did (v0.9, v0.11,
  v0.12, v0.13 all bumped in their PR1), but it is unsatisfiable now that
  `src/__tests__/roadmap-milestone-status.test.ts` exists: with package.json at
  0.14.0 and this section not yet terminal, its "marks every milestone at or
  below the shipped version DONE or DEPRIORITIZED" assertion fails, naming this
  exact heading (verified by running it, 1 failed / 3 passed). The only ways to
  bump in PR1 are to write a DONE header that is not true or to widen the guard
  one increment after it was built, so the bump moves instead - which is also
  what this file's own versioning convention says ("one bump per shipped feature
  milestone").

### v0.15 - First run: the front door a stranger actually meets (DONE)

**DONE 2026-07-26**, two PRs merged and deployed:

- PR1 [#123](https://github.com/rodmen07/calm-daily-coach/pull/123): the three
  sign-in surfaces agree (D2). `/`'s alert paragraph became the shared
  `src/app/components/auth-message.tsx`, `/focus` and `/pricing` render it for
  the first time, `src/__tests__/auth-message-contract.test.ts` fails when a
  `.tsx` under `src/app` calls `signInWithGoogle` without it (D3), and `/focus`
  got its first page test (D4), so no route is untested any more. Closed the MED
  bug.
- PR2 [#124](https://github.com/rodmen07/calm-daily-coach/pull/124): the
  onboarding gate is hydration-safe (D5). `showOnboarding` starts `false` and is
  settled in an effect, the shape `AnimatedCounter` already uses in the same
  file, so the first client render agrees with the prerendered HTML for a
  first-time visitor too; the now-redundant `typeof window` guard in the JSX is
  gone. Closed the LOW bug and carried the bump to 0.15.0 plus this heading.

Defined 2026-07-26 (product-role increment), the milestone after v0.14.

v0.14 opened every route to a signed-out person earlier the same day. Before
that, `subscription-guard.tsx` answered `!authUser` with a full-screen wall on
every page, so **no visitor has ever arrived at this app without an account**.
The first-run path became reachable today and has never been exercised as a
real product path. Three defects filed in the last two days all sit on exactly
it, and each was found while doing something else:

- Only one of the three sign-in surfaces tells the truth. `useCoachAuth` is a
  hook, not a context, so each caller owns a private `authMessage`. `/`
  (`page.tsx:684`) renders it in a `role="alert" aria-live="assertive"`
  paragraph; `/focus` (`:17`) and `/pricing` (`:9`) destructure the hook without
  it and render it nowhere, so a sign-in failure that does not self-recover
  through the redirect fallback produces nothing at all on the checkout entry
  point. Filed MED by PR #121.
- `/focus` is the only one of the thirteen `page.tsx` routes with no test file,
  and it carries one of the two silent buttons.
- The onboarding gate reads localStorage in a `useState` initializer
  (`page.tsx:138`), so a **first-time** visitor hydrates a mismatch: the static
  HTML has no overlay (verified live by `curl`, which finds neither
  "Personalize your coach" nor `GUEST (LOCAL)` in the prerender) while the first
  client render has one. A returning visitor is unaffected, which is why this
  has never mattered until now. Filed LOW by PR #120.

Chosen over reminder reach via FCM (still USER-ONLY console gates), a
performance pass (still no web-vitals baseline, so "faster" is not
CI-checkable), extending guest migration to planner state and slicer history
(cheap and now unblocked, but it deepens what a guest *keeps* rather than
fixing what a guest *meets*), and Playwright E2E - whose recorded objection
("a suite written now would encode the behavior v0.14 changes") **expired the
moment v0.14 shipped**, making it the strongest runner-up and the recommended
milestone after this one. It is declined here on ordering, not habit: a browser
suite written now would pin the first-run path with its hydration warning and
its silent sign-in intact. Frontend-only: no new env var, no new Firestore
collection, no new security rule, no new console gate. Full audit, plan, and
every overridable default:
[docs/design/FIRST_RUN.md](design/FIRST_RUN.md).

- PR1: extract the alert paragraph into a shared component (D2), render it on
  `/focus` and `/pricing`, add a guard test asserting every `signInWithGoogle`
  call site also renders it (D3), and give `/focus` its first page test (D4).
  Closes the MED bug.
- PR2: move the onboarding read out of the `useState` initializer to the
  hydration-safe pattern `AnimatedCounter` already uses in the same file
  (`page.tsx:56-65`, D5), with a test pinning the first client render. Closes
  the LOW bug. **Carries the package.json bump to 0.15.0** and flips this
  heading to DONE in the same commit, for the reason v0.14 recorded and
  verified: `src/__tests__/roadmap-milestone-status.test.ts` fails when the
  shipped version reaches a milestone whose heading is not terminal.
- Product rules apply: no new banner, modal, interstitial, or countdown is
  added for a guest (D6). The only copy this milestone adds already exists in
  the codebase and is currently shown to nobody.
- Explicitly NOT in scope (D7): the LOW "no single test walks
  guest-writes-then-signs-in through the gate in one render" filed by PR #121,
  which stays QA-stream work.
- Done when: the checklist in
  [docs/design/FIRST_RUN.md section 5](design/FIRST_RUN.md#5-done-when-checkable)
  is met, and `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm audit --audit-level=high`, and `npm run test:coverage` are green on the
  quality-gate check.

### v0.16 - E2E smoke: the product walked by a real browser (DONE)

**DONE 2026-07-26**, two PRs merged and deployed:

- PR1 [#126](https://github.com/rodmen07/calm-daily-coach/pull/126): the
  harness and journey J1. `@playwright/test` (chromium only) in
  `devDependencies`, `playwright.config.ts` + `e2e/serve.mjs` serving the real
  static export under the production repo-name basePath (D3), the
  vitest `exclude` for `e2e/**` with separation proven both ways (D5), the
  auto console-error tripwire with an empty reason-carrying allowlist, and
  `.github/workflows/e2e.yml` observed both red and green on its own PR while
  branch protection stayed exactly `["lint-and-build"]` (D4).
- PR2 [#129](https://github.com/rodmen07/calm-daily-coach/pull/129): journeys
  J2 and J3. J2 walks the whole daily loop (non-default focus
  and dose picked on `/focus`, plan generated, check-in on `/execute`) and
  pins PR #90's fix at the lifecycle it lives at: the dashboard ring reads 100
  percent and a REAL page reload still reads 100 percent. J3 writes a journal
  entry, reloads, edits it in place, and proves one-entry-per-day through the
  history panel staying empty. Carried the bump to 0.16.0 plus this heading.

Defined 2026-07-26 (product-role increment), the milestone after v0.15.

Every test this repo has ever run lives in jsdom (533 as of PR #124), and the
defect classes that slipped through a green 500+ suite in the last four days
are exactly the ones only a real browser sees: the deployed site serving
spinner-only HTML on every route (found by hand-`curl` in PR #114, not by any
test), the onboarding hydration mismatch (fixed in PR #124, pinned today by
`renderToStaticMarkup`, which is a render-phase proxy rather than real
hydration), and the check-in ring resetting on reload (fixed in PR #90; jsdom
remounts components but nothing reloads a page). Playwright E2E has been the
standing recommendation since the v0.15 definition; it was declined there on
ordering only, and both defects it would have pinned are now fixed, so a suite
written today pins the correct first-run behavior.

Three smoke journeys plus a console-error tripwire, run against the real
static export served under the production repo-name basePath, never
`next dev`. Chromium only, `@playwright/test` in `devDependencies` only. The
new `e2e` CI job runs on every PR and main push but is **not** a required
context: requiredness is earned by observed stability (the
`security-audit.yml` precedent), and branch protection stays exactly
`["lint-and-build"]`. Full audit, plan, and every overridable default:
[docs/design/E2E_SMOKE.md](design/E2E_SMOKE.md).

- PR1: harness (`playwright.config.ts`, `e2e/` testDir, vitest `exclude` for
  `e2e/**` with separation proven both ways), journey J1 (first-run: prerender
  visible, onboarding appears only after hydration, reload keeps it closed),
  the console-error tripwire with an empty reason-carrying allowlist, and the
  `e2e` job observed both red and green on its own PR.
- PR2: journeys J2 (check-in ring survives a real reload) and J3 (journal
  entry survives a real reload, edits in place), **carries the package.json
  bump to 0.16.0** and flips this heading to DONE in the same commit, per the
  `roadmap-milestone-status.test.ts` contract.
- Explicitly NOT in scope: signed-in journeys (D7: OAuth cannot be walked
  headlessly without credentials, and secrets never enter tests), extra
  browsers, extra routes (`/now` is timer-driven and a flake source), and the
  PR-template half of the old candidate below (D6: repo hygiene, not E2E).
- Done when: the checklist in
  [docs/design/E2E_SMOKE.md section 5](design/E2E_SMOKE.md#5-done-when-checkable)
  is met, and the five pinned gate commands are green on the quality-gate
  check.

### v0.17 - Sign-in keeps your workspace: slicer history and today's plan cross over (DONE)

Defined 2026-07-26 (product-role increment), the milestone after v0.16.
Shipped 2026-07-27: PR1 (PR #131, slicer task history) + PR2 (planner-state
crossover, `migrateGuestSingleRecord`, this heading's flip and the 0.17.0
bump in the same commit).

v0.13 promised "bring your data with you" and stopped at three collections;
its D7 excluded planner state and slicer task history as "ephemeral,
today-scoped working state rather than a record a person would miss." That
premise was re-verified at source for this definition and **the slicer half is
false**: `SlicedTask` carries `createdAt`/`completedAt` and `loadSlicedTasks`
applies no staleness drop, so a half-completed task sliced weeks ago is
durable data - exactly a record a person would miss. Meanwhile `/slicer` keys
storage by `authUser?.uid ?? "guest"` and reloads on scope change, so at the
moment sign-in resolves, a guest's whole task list visibly vanishes; and the
dashboard ring resets at sign-in because `SavedPlannerState.checkedIn` lives
in the scope-keyed planner blob that never crosses, even though the check-in
record itself migrates (the PR #90 defect class, reappearing at the sign-in
boundary). None of this could bite before v0.14 opened the front door; now it
bites at the exact moment of conversion.

Extend guest-to-account migration to both stores on the existing
`src/lib/guest-migration.ts` primitive. Account wins, non-destructive, marker
keys extend the exact v0.13 shape (`:local:slicer` / `:local:planner`), no new
surface area of any kind (both stores are and remain localStorage-only). Full
audit, plan, and every overridable default:
[docs/design/GUEST_WORKSPACE_MIGRATION.md](design/GUEST_WORKSPACE_MIGRATION.md).

- PR1: slicer task history migration (id-identity dedupe, before `/slicer`'s
  first account-scope read), marker-byte pin test, guest-slices-then-signs-in
  walked in one render.
- PR2: `migrateGuestSingleRecord` sibling helper + same-day planner-state
  copy inside `hydratePlannerSession`; closes the ring-reset-at-sign-in seam;
  **carries the package.json bump to 0.17.0 and flips this heading to DONE in
  the same commit**, per the `roadmap-milestone-status.test.ts` contract.
- Explicitly NOT in scope: Firestore sync for either store, any change to the
  three shipped migrations or their marker keys, and the `defaultTheme`
  dead-field LOW (its own product call, still a candidate below).
- Done when: the checklist in
  [docs/design/GUEST_WORKSPACE_MIGRATION.md section 5](design/GUEST_WORKSPACE_MIGRATION.md#5-done-when-checkable)
  is met, the pre-existing migration tests pass unchanged, and the five pinned
  gate commands are green on both PRs.

### v0.18 - Web Vitals Baseline: measure performance so future optimizations are CI-checkable (DONE)

Defined 2026-08-01 (product-role increment, PR #135); shipped 2026-08-01 (DevSecOps-role increment). Decision D1 was approved by the user as its default on 2026-08-01.

**Scope:** add Lighthouse CI to every PR and main push to report Core Web Vitals against the deployed Pages artifact, establish a regression gate, and capture baseline measurements. **Zero user-facing features** — this is pure instrumentation that removes the blocker preventing future "Perf Pass" milestones from being CI-verifiable. The perf pass has been the standing runner-up since v0.12, deferred on "no web-vitals baseline exists, so 'faster' is not CI-checkable" — this milestone establishes the baseline and unblocks every future optimization.

**Plan and every default:** [`docs/design/WEB_VITALS_BASELINE.md`](design/WEB_VITALS_BASELINE.md), decisions D1-D5, each now annotated with what actually shipped.

DONE:
- `.github/workflows/lighthouse.yml` runs Lighthouse CI on every PR and every main push (D5), measuring the real static export served by `e2e/serve.mjs` under the production basePath (D3).
- `lighthouserc.cjs` pins the gate: a per-audit `minScore` floor at `measured baseline - 0.05`, which is D1's approved "5+ point drop fails the PR" in the units Lighthouse actually scores in.
- **The tracked third metric is Total Blocking Time, not INP.** Lighthouse declares `interaction-to-next-paint` with `supportedModes: ['timespan']` and `weight: 0`, so a navigation run never produces it and an INP assertion could never fail. TBT is Lighthouse's own lab stand-in for responsiveness and carries the largest weight in the performance category. Verified at the source, recorded in section 6 of the design doc, guarded by `src/__tests__/lighthouse-baseline-contract.test.ts`, and open for user confirmation in the backlog.
- The measured baseline is recorded in section 7 of the design doc, and every run prints its own calibrated floors to the job summary so recalibration is mechanical.
- The check shipped non-blocking per D4: branch protection stayed exactly `["lint-and-build"]` at the time of this milestone, the same precedent `security-audit.yml` and `e2e.yml` already set. Promoting it to required once the baseline proved stable was a filed follow-up, not an assumption. **That follow-up closed on 2026-08-08 (PR #161):** 58 runs of `lighthouse.yml`, exactly one failure, and that one on the PR branch that introduced the workflow before it merged, so 55 consecutive green runs post-merge across 7 days. Required contexts are now `["lint-and-build", "lighthouse"]`, declared in `.github/required-checks.json`.

### v0.19 - Perf pass: the first screen arrives calm and stops moving (DONE)

Defined 2026-08-01 (product-role increment), the milestone after v0.18. This is
the milestone v0.18 was built to make possible, and it closes the HIGH bug
v0.18's first measurement found.

**Every target below is a measured number, not an aspiration.** Read out of the
Lighthouse report JSON of run `30709755854` (the post-merge main run of PR
#137), not inferred: performance 0.50, LCP 6.8 s of which **93 % is render
delay** (TTFB 454 ms, load delay 0, load time 0, render delay 6371 ms), CLS
0.752, TTI 12.9 s, 22 scripts totalling 1.69 MB with 1,047 KiB reported unused
on this route.

Both headline numbers have a named cause:

- **CLS 0.752 is one single shift**, and the node that moves is
  `main#main-content > div.page-shell > div.mx-auto > section.panel`. The only
  thing that can appear above it is the first-run onboarding block, which
  `out/index.html` does not contain (`grep -c 'onboarding-container'` returns 0,
  by PR #124's design) and which hydration then raises **in normal flow**,
  pushing the whole dashboard down. On an app whose premise is being calm to use
  with ADHD, three quarters of the viewport moving under the reader is the
  product contradicting itself.
- **LCP is waiting on script, not on the network.** Nothing about the LCP
  element is late to download; it is late to render. The largest chunk on the
  route is 670 KB carrying `@firebase/app`, `@firebase/auth` and
  `@firebase/firestore` with **531 KiB unused here**, pulled in by
  `src/lib/firebase.ts` through `use-coach-auth.ts` through
  `subscription-guard.tsx` through `layout.tsx`, so every page of this app
  downloads the whole Firebase SDK. The second largest is 295 KiB with 224 KiB
  unused and carries `zod`, whose only two consumers in this repo are a
  three-field schema and a three-field schema.

Full audit, plan, and every overridable default:
[docs/design/PERF_PASS.md](design/PERF_PASS.md), decisions D1 to D7.

- PR1: stop the shift. Render the first-run overlay out of normal flow (D1),
  with focus move, Escape to skip, focus containment and the v0.8 reduced-motion
  reset honored. **PR #124's regression test must pass unchanged and must not
  appear in the diff** - if it has to be edited, the fix reintroduced the
  hydration mismatch it is standing on.
- PR2 and PR3: stop shipping code the first screen cannot use. **Planned as one
  PR, split into two on size grounds once the file inventory was taken** - D4
  reaches 12 runtime and 21 test files because every synchronous
  `getFirebaseFirestore()` capability probe has to become an awaited one, while
  D5 reaches 2 runtime files and no async boundary; the reasoning is recorded in
  [docs/design/PERF_PASS.md](design/PERF_PASS.md) section 3.
  - **PR2 (done, PR #140): zod leaves the entry route (D5).** Attribution ran
    first as D5's honesty gate demanded, by counterfactual build rather than
    marker scan: removing it takes the entry document from 1,672,898 B across 12
    chunks to 1,389,779 B across 11, and the 301,096 B chunk disappears rather
    than shrinking, so zod was ~94 % of it. The two schemas are now hand-written
    over `src/lib/parse.ts`, and the zod-era `onboarding.test.ts` and
    `plan.test.ts` are not in the diff and still pass, which is the
    behavior-preserving receipt.
  - **PR3 (next): defer Firebase and split Firestore from Auth (D4). Carries the
    package.json bump to 0.19.0 and flips this heading to DONE in the same
    commit**, per the `roadmap-milestone-status.test.ts` contract.
- Both PRs **ratchet the gate down** in the same commit that improves the
  metric (D3): a win the gate does not defend decays back.
- Explicitly NOT in scope: widening the gate beyond `/`, promoting the
  `lighthouse` context to required (both already filed as their own follow-ups),
  any visual redesign or copy change, images (the report shows zero on this
  route), and fonts (`font-display` already scores 1).
- **Two harness divergences were confirmed during this design pass and are
  recorded rather than fixed (D7):** `e2e/serve.mjs` serves uncompressed while
  GitHub Pages serves gzip (measured on the live site: the 13 assets the
  deployed entry document references are 1,751,261 bytes uncompressed and
  494,416 bytes gzipped), and the Lighthouse build receives no
  `NEXT_PUBLIC_FIREBASE_*` values while the deployed build does. The gate stays
  a valid relative regression detector either way, but its absolute numbers are
  pessimistic for a real visitor, and this file should not be read as saying
  otherwise.
- Done when: the checklist in
  [docs/design/PERF_PASS.md section 4](design/PERF_PASS.md#4-done-when-checkable)
  is met - CLS ≤ 0.10 and script transfer ≤ 1.0 MB reported by the gate's own
  job (both met), LCP ≤ 4.0 s **under production-shaped serving** (measured
  2.7 s, PR4's controlled A/B; **re-scoped 2026-08-05 by user decision D7-(b)**,
  since the gate's own harness served uncompressed by design at the time and
  that was a fact about the harness, not the shipped app - see section 2 of the
  design doc), `lighthouserc.cjs` and WEB_VITALS_BASELINE.md section 7 carrying
  the new numbers with the contract test green, and the five pinned gate
  commands plus the `e2e` job green on both PRs. **The harness caveat retired
  itself one milestone later:** v0.20 PR1 taught `e2e/serve.mjs` gzip, and the
  gate now measures ~2.7 s directly (run `31167698390`), so the two-numbers
  reading of this paragraph is history, not current guidance.

### v0.20 - Measurement accuracy: the gate asserts what a visitor is served (DONE)

Defined 2026-08-06 (product-role increment), the milestone after v0.19, and the
follow-up D7's own text named as "worth taking if the user prefers absolute
realism over a stable baseline" (docs/design/PERF_PASS.md section 2). v0.19
closed on user decision D7-(b), which re-scoped the LCP sentence rather than
fixing the harness, so this file and the design doc now state two numbers for
one page: LCP 2.7 s as served (gzip, PR #143's controlled A/B) and ~5.5 s as
measured by the gate, because `e2e/serve.mjs` serves identity bytes while
GitHub Pages serves gzip. Every reader of the gate's output has to hold that
caveat in mind to read it correctly. This milestone retires the caveat by
making the harness serve what GitHub Pages serves, then recalibrating every
floor so the gate defends the real number.

The measured basis is already recorded, not re-derived here: the 13 assets the
deployed entry document references total 1,751,261 bytes uncompressed and
494,416 bytes gzipped (PERF_PASS.md section 2, measured on the live site), and
Lighthouse's simulated throttling derives its timings from transfer size,
which is why the uncompressed harness roughly doubles LCP.

Two PRs, in dependency order:

- **PR1 (done, PR #148): the harness compresses, and the gate is recalibrated
  in the same commit.** `e2e/serve.mjs` learns gzip content negotiation via `node:zlib`
  (the stdlib-only rule from E2E_SMOKE.md stands: no new dependency), with a
  behavior-difference test that requests the entry document with and without
  `Accept-Encoding: gzip` and asserts the `content-encoding` header and the
  byte counts differ between the two responses; the test must be run once
  against origin/main's server and observed failing there, with the red quoted
  in the PR body. Then every assertion in `lighthouserc.cjs` is recalibrated
  from that PR's own runs by the established method (worst best-of-run across
  two independent three-run invocations; score floors at measured minus D1's
  five points where the score has room to fall, raw-value ceilings where it
  does not): the LCP pair must TIGHTEN to defend the compressed number (a
  6500 ms ceiling over a ~2.7 s page defends nothing, and D3 says a win the
  gate does not defend decays back), the CLS pair should hold (transfer size
  does not move layout; confirm rather than assume), and TBT's 500 ms ceiling
  is re-derived from measurement (TBT is CPU-bound, so compression should
  barely move it; if it does, that is a finding to file). Section 7 of
  WEB_VITALS_BASELINE.md carries the new numbers in the same commit with
  `lighthouse-baseline-contract.test.ts` green, and the two-numbers caveat is
  retired everywhere it is written: v0.19's done-when note above, the Later
  preamble below, and PERF_PASS.md section 2's D7 paragraphs are updated to
  record the serving divergence as closed, history preserved.
- **PR2 (done, this PR): the gate widens to the revenue route.** `/pricing/`
  is measured
  alongside `/` with per-URL thresholds via `assertMatrix`, calibrated from
  that PR's own runs by the same method, and the contract test's doc-parity
  check extends to every measured URL, so a URL the gate measures without
  documented numbers fails the suite. This is the already-filed follow-up
  (2026-08-01, filed by PR #136) scheduled into a milestone rather than new
  scope. Carries the package.json bump to 0.20.0 and flips this heading to
  DONE in the same commit, per the `roadmap-milestone-status.test.ts`
  contract.

Explicitly NOT in scope, each an overridable default:

- **The second D7 divergence stays open.** The measured build still has no
  `NEXT_PUBLIC_FIREBASE_*` values, so it skips runtime auth resolution the
  deployed build pays for. Passing repo secrets into a `pull_request`-triggered
  workflow on a public repository is a supply-chain decision, not a
  measurement one (PERF_PASS.md section 2 records why), and it does not ride
  along with a milestone the user has not looked at.
- **Promoting the `lighthouse` context to required** keeps its own clearing
  condition (observed stability on main, backlog item of 2026-08-01) and is
  not decided by this milestone either way.
- **No app-code or user-facing change of any kind.** This milestone touches
  the harness, the gate config, the contract test, and the docs. If
  recalibration turns up an app regression, it is filed as a bug, never
  absorbed into a looser floor.
- **No URLs beyond `/` and `/pricing/`.** Each extra URL costs three
  Lighthouse runs per PR; `/journal/` and `/trends/` stay in the follow-up
  queue until a regression risk there is worth that price.

Done when, each clause checkable by CI rather than by opinion:

1. The serve-level compression test is green, and PR1's body quotes it
   failing against the pre-change server.
2. The `lighthouse` job is green on both PRs with the recalibrated
   `lighthouserc.cjs`, and the LCP ceiling it asserts for `/` is at most
   4000 ms. If calibration cannot support a ceiling at or below 4.0 s, the
   D7 attribution was wrong, and that finding goes back to the user rather
   than into a looser number.
3. `lighthouse-baseline-contract.test.ts` is green with WEB_VITALS_BASELINE.md
   section 7 carrying the same values for every measured URL, and it fails
   when a measured URL has no documented numbers.
4. The five pinned gate commands plus the `e2e` job are green on both PRs,
   package.json reads 0.20.0, and this heading reads DONE only in PR2's
   commit.

Chosen over, with the trail: the two product-gated HIGH bugs the 2026-08-05
backlog note still described as "needing a user product decision first" turned
out to be a stale premise, not candidates. Re-verified at source this pass
rather than inherited: the guest-mode wall was FIXED in PR #121 (2026-07-26)
and the paywall dead-end in PR #117 (2026-07-25), both MERGED (confirmed via
`gh pr view` on 2026-08-06) and both verified on the deployed artifact at the
time, so the backlog entry is corrected rather than repeated. Also chosen over
FCM push (USER-ONLY console gates), the `StatusMessage` consolidation (since
promoted into v0.21 below), the `defaultTheme` LOW, and the D1/D2-wording doc
edit. (This sentence originally called that doc edit "still awaiting the
user's confirmation" - stale when written: the user had confirmed both
defaults directly ("defaults ok") on 2026-08-05. Corrected 2026-08-07 by the
v0.21 definition pass, in the same PR that ships the doc edit itself:
`docs/design/WEB_VITALS_BASELINE.md` sections 6-7 now record the confirmation
instead of an open question.)

### v0.21 - One calm status vocabulary: transient status speaks through one accessible primitive (DONE)

Defined 2026-08-07 (product-role increment), the milestone after v0.20. It
promotes the design call PR #123 filed for itself when it extracted
`AuthMessage`: whether this app wants one generic `StatusMessage` primitive
owning the markup, tone classes, and politeness semantics for page-level
transient status, instead of the four page files (`/`, `/execute`, `/now`,
`/trends`) that currently spell it inline in two diverging vocabularies.
Design doc: [docs/design/STATUS_VOCABULARY.md](design/STATUS_VOCABULARY.md),
every premise re-read at source 2026-08-07 and three inherited claims
corrected there rather than repeated (the bug entry's `/journal` surface does
not exist, the guard-count sentence reads Eleven not Nine, and `/execute`'s
third banner is a neutral `text-slate-800` whose tone mapping is now its own
overridable sub-decision, D2a). Every decision an overridable default.

What it fixes, beyond consistency: `/now` and `/trends` render only the
migration "ok" branch, so a failed migration there is silent (the same shape
as the `/focus`/`/pricing` sign-in bug PR #123 closed, on the migration
concern); the "Google login is not configured yet" notice on `/` has no live
region at all; and `/execute` has grown a parallel `-800`-shade tone system.

Two PRs, in dependency order (see the design doc's D7 for the full slices):

- **PR1:** the `StatusMessage` primitive with tone-derived politeness
  (`error` = `role="alert"` assertive; `success`/`notice` polite), adopted by
  `/` (four statuses) and `/execute` (its banners, celebrate preserved, the
  advice line per D2a); `AuthMessage` becomes a thin delegate with its
  contract test passing UNCHANGED; a new guard suite fails when any
  `src/app/**/page.tsx` spells a literal `role="alert"`, observed red against
  the unmigrated pages first; the Current-state guard-count sentence goes
  **Eleven -> Twelve** and names the new suite, in the same PR.
- **PR2:** `/now` and `/trends` adopt the primitive and gain the missing
  error branch, with regression tests observed failing against origin/main
  first; carries the 0.21.0 bump and flips this heading to DONE in the same
  commit, per the `roadmap-milestone-status.test.ts` contract.

**Shipped 2026-08-07** (PR #152 = PR1, PR #153 = PR2). One correction the
milestone made to its own design while implementing it, recorded here rather
than left in a PR body: D4 assumed the error branch was purely a RENDER gap,
but `/now` and `/trends` also never SET `{ type: "error" }`, so adding the
markup alone would have shipped a branch nothing can reach. Both halves
landed. The failure the regression tests inject is therefore the local
storage write, not a Firestore rejection: `focus-session-store.ts` falls back
to the local migration when the Firestore copy throws, and that fallback
succeeds and reports `migrated`, so a rejected cloud write never reaches the
error branch at all. A full or disabled localStorage does, and that is
exactly the case where the sessions really are not where the person expects.

Done when (checkable by CI; the design doc section 4 carries the full
clauses): the tone-to-politeness behavior tests are green with their
perturbations quoted; the guard suite is red-then-green across PR1 with
`roadmap-guard-count` green; the `/now`/`/trends` error-branch tests fail on
origin/main and pass after PR2; `auth-message-contract.test.ts` is unchanged
and green in both PRs; all tier-1 gates plus `e2e` and `lighthouse` are green
on both PRs; package.json reads 0.21.0 with the heading flip only in PR2.

Chosen over, with the trail (full reasoning in the design doc section 5):
workspace cloud sync (would add a third unpublished Firestore rules block
while the v0.9 and v0.12 blocks still await the console publish - deepening a
pending USER-ONLY obligation), the security-hardening remainder (re-verified
live 2026-08-07 through `gh api`: secret scanning, push protection, private
vulnerability reporting, and dependabot security updates are all already
ENABLED and all six workflows carry a `permissions:` block, so what remains -
a truthful SECURITY.md in place of the GitHub boilerplate advertising
versions 5.1.x/4.0.x of an 0.20.0 app, and the dead four-secret injection on
`dev-agent-runner.yml`'s echo-only step - is one DevSecOps cadence increment,
not a milestone), FCM push (console-gated, unchanged), the D7 second measurement
divergence (user decision), the `lighthouse` required-context promotion (own
clearing condition), and `/journal/`+`/trends/` gate widening (v0.20's cost
reasoning stands). **Update 2026-08-07:** the security-hardening remainder in
that list SHIPPED the same day as PR #154 (a truthful SECURITY.md naming no
version at all, so it cannot go stale at a bump, plus the dead four-secret
`env:` block deleted), exactly as one DevSecOps cadence increment. The clause
above is kept for the record of why v0.21 passed over it, not as a live claim.

### v0.22 - One route vocabulary: every shipped surface is reachable, and nothing internal is in the front door (DONE)

Defined 2026-08-07 (product-role increment), the milestone after v0.21. Design
doc: [docs/design/ROUTE_VOCABULARY.md](design/ROUTE_VOCABULARY.md), every
premise read out of the working tree at `43fa2da` rather than inherited, with
line citations. Every decision an overridable default.

It applies v0.21's move to routes. The app ships **13** routes
(`find src/app -name page.tsx`), and **four independent hardcoded lists**
decide where a person can go, with no test comparing any of them to the routes
that exist: `NAV_LINKS` (`site-nav.tsx:12-25`, 12 entries, rendered on every
page via `layout.tsx:68`), `GO_TO_TARGETS` (`keyboard-help.tsx:16-23`, the 6
chords `router.push` actually reads), `SHORTCUT_ROWS`
(`keyboard-help.tsx:36-55`, whose six "Go to X" rows restate the chord table in
prose under a comment that says "Keep this table honest when shortcuts
change"), and the dashboard action rail (`page.tsx:346,358,369,377`).

What it fixes for a person, both verified at source and both fallout of having
four lists instead of one:

- **`/now` is in no navigation surface.** It is absent from `NAV_LINKS` and
  from `GO_TO_TARGETS`, reachable only from the dashboard rail
  (`page.tsx:377`), so the calm single-task timer that v0.12 built a `/trends`
  card around is invisible from every other page.
- **`/monetization` sits in the primary nav** (`site-nav.tsx:24`) although the
  page describes itself as an internal analytics view for the developer
  ("so you can validate monetization UX before backend analytics is wired",
  `monetization/page.tsx:45`). A first-time visitor meets a nav item named
  after the business model, one slot after Pricing.

Two PRs, in dependency order (design doc D8):

- **PR1 (#156, merged 2026-08-07):** `src/lib/routes.ts`, the registry (`path`, `label`,
  `inPrimaryNav`, `goToKey?`, `audience`); `site-nav.tsx` rendering from it
  instead of its own array; the D3/D4 changes (`/monetization` out of the
  primary nav and marked internal, its page and its dashboard "View analytics"
  link untouched; `/now` in, labelled "Now"); and the new
  `route-registry-guard` suite, **plus the Current-state guard-count sentence
  taken from Fourteen to Fifteen naming that suite**. No version bump in PR1,
  per the `roadmap-milestone-status.test.ts` contract v0.14 PR1 proved.
  *Corrected during PR1 (the definition put the guard-count edit in PR2):*
  `roadmap-guard-count.test.ts` counts `.test.ts` files on disk under
  `src/__tests__` and `src/app/__tests__`, so the sentence must move in the
  same commit that adds the suite or PR1's own required gate goes red. Deferring
  it was not a smaller PR1, it was a red one.
- **PR2 (#157, merged 2026-08-07):** `keyboard-help.tsx` deriving BOTH its
  chord table and its dialog rows from the registry (D5 adds `g n` for `/now`,
  D6 generates the now **seven** "Go to X" rows), then the 0.22.0 bump in
  `package.json` and both `package-lock.json` copies and this heading flipped
  to DONE, all in the same commit. Two consequences worth recording: the
  registry gained a `GoToRoute` narrowing so no consumer casts `goToKey`, and
  PR1's `GO_TO_TARGETS` equality assertion became TAUTOLOGICAL the moment both
  sides derived from one list, so it was replaced rather than kept — the guard
  now reads the dialog's rendered rows and a real `router.push`, which a
  derivation regression can still fail.

Done when, each clause checkable by CI rather than by opinion, and none of them
an existence grep:

1. `src/app/__tests__/route-registry-guard.test.ts` glob-discovers every
   `src/app/**/page.tsx` with a zero-match hard failure, a floor of at least 13
   routes, and two named anchors (`/` and `/monetization`), then fails when a
   discovered route is missing from the registry or a registry `path` has no
   page file. The blinded-discovery control is part of the suite, not just the
   PR body.
2. Rendering `<SiteNav />` produces exactly the links the registry marks
   `inPrimaryNav`, in registry order, asserted from the rendered DOM: adding a
   link by hand to the component fails.
3. The rendered nav contains a link to `/now` and contains no link to
   `/monetization`, while `/monetization` is still a registry entry with
   `audience: "internal"` and `src/app/monetization/page.tsx` still exists, so
   "removed from the front door" and "deleted" cannot be confused.
4. Rendering the keyboard dialog produces exactly one "Go to X" row per
   registry entry carrying a `goToKey`, using the registry's label, and
   pressing `g` then that key routes to that path. A chord added without a row,
   or a row without a chord, fails.
5. Every behavioral clause above is proven by a negative control whose
   perturbation is confirmed applied and whose red output is quoted, with the
   implementation committed before the first perturbation.
6. The pinned CI gate is green on both PRs (`npm run lint`, `npm run
   typecheck`, `npm run test:coverage`, `npm run build`, `npm audit
   --audit-level=high`, Node 24 per `.github/workflows/ci.yml`), and the
   non-required `e2e` and `lighthouse` contexts stay green.
7. After PR1: the guard-count sentence reads Fifteen and names the new suite
   (`roadmap-guard-count`, which counts the suites on disk and therefore cannot
   be satisfied a PR later). After PR2: `package.json` reads `0.22.0` with both
   lockfile copies matching (`lockfile-version-parity`) and this heading reads
   DONE (`roadmap-milestone-status`).

Chosen over, with the trail (full reasoning in the design doc section 5): a nav
grouping or visual redesign (a redesign mixed into a data-layer extraction is
unreviewable, and the registry is what makes a later `group` field cheap), the
still-open silent-migration product question filed by PR #153 (needs a decision
about whether a successful-but-local-only copy deserves any notice, and it is
not a routing question), workspace cloud sync (still deepens the unpublished
Firestore rules obligation), FCM push (console-gated, re-checked and
unchanged), the D7 second measurement divergence (user decision), the
`lighthouse` required-context promotion (own clearing condition), and
`/journal/`+`/trends/` gate widening (v0.20's cost reasoning stands).

### v0.23 - A front door that fits: the header stops being the only way in, and stops taking a third of the screen (DONE)

**Shipped 2026-08-08** (PR #160 = PR1, PR #162 = PR2). The header measured
**138 px at 375x667 (20.7% of the viewport, one row), 138 px at 412x823
(16.8%), 138 px at 360x740 (18.6%) and 67 px at 1280x720 (9.3%)** after the
collapse, against the 264 / 222 / 264 / 180 px this section records before it -
each figure taken in chromium against the real static export, the same way the
premises below were taken. One thing PR2 added that D4 did not name: the More
disclosure closes when a link inside it is chosen. Client-side navigation does
not remount `SiteNav` and a `<details>` keeps its open state in the DOM rather
than in React, so without it the menu hangs open over the page the reader just
navigated to. D4's two stated costs are unchanged and still stand - native
`<details>` closes on neither `Escape` nor an outside click - and the popover
alternative remains the recorded way to buy them.

Defined 2026-08-08 (product-role increment), the milestone after v0.22. Design
doc: [docs/design/NAV_SHAPE.md](design/NAV_SHAPE.md). Every number below was
**measured on the shipped static export** at `776ab2b` - `npm run build` into
`out/`, served by the same `e2e/serve.mjs` the E2E and Lighthouse harnesses
use, driven by the repo's own Playwright chromium - not estimated from the CSS
and not inherited from a previous doc. Every decision is an overridable
default.

It is where v0.22 leads. v0.22 made one registry decide WHICH doors exist;
v0.23 asks whether a person can actually get through them, and finds two
answers that are both no.

**The sticky header takes a quarter to two fifths of the viewport, on every
route.** `layout.tsx:64` puts the nav in a `position: sticky` shell
(`globals.css:134-141`), so its height is subtracted from the reading area
permanently rather than once. Measured identically on `/`, `/now/` and
`/pricing/`: **264 px at 375x667 (39.6% of the viewport, 4 rows of pills)**,
222 px at 412x823 (27.0%, 3 rows), 264 px at 360x740 (35.7%), and **180 px at
1280x720 (25.0%, still 2 rows)**. The desktop figure is what makes this not a
phone bug: `.site-nav-inner` is capped at `max-width: 56rem`
(`globals.css:144`), so twelve pills never get more than 896 px however wide
the window is. There is no responsive treatment to appeal to - `globals.css` is
the only stylesheet the app ships, it holds exactly two `@media` blocks
(`max-width: 640px` at line 1304 and `prefers-reduced-motion` at 1354), neither
mentions any `.site-nav-*` class, and neither `layout.tsx` nor `site-nav.tsx`
carries a single `sm:`/`md:`/`lg:` prefix.

**Six of the twelve primary-nav routes are reachable from nowhere else in the
app.** A link census across `src/app/**` and `src/lib/**`, excluding tests and
excluding the nav surfaces themselves, finds zero other doors for `/slicer`,
`/ambient`, `/breathe`, `/challenges`, `/trends` and `/journal`. Four of those
- `/slicer`, `/ambient`, `/breathe`, `/challenges` - have no `g` chord either,
so each has **exactly one affordance in the entire product**: a pill in a
header that wraps to four rows on a phone. `/slicer` is the largest surface in
the repo at 729 lines, and its own `<h1>` reads "ADHD Task Slicer".

**That census is what reverses the obvious fix.** This milestone started as
"collapse the nav behind a More disclosure"; run against the real tree, that
plan takes four routes' only door and hides it one interaction deeper. So
v0.23 is two halves in a fixed order, and the order is the design: **PR1 gives
every route a second door** and ships the guard that makes "header-only" fail
CI, **PR2 then collapses the header** to a measured single row. Half 2 without
half 1 is a regression wearing a redesign's clothes; half 1 alone is worth
shipping, which is what makes the split safe.

The collapse target is measured rather than chosen. Candidate shapes
prototyped in the browser against the real export: 5 links + More gives 180 px
at 375x667 (2 rows), 4 links + More gives the same 180 px, **3 links + More
gives 138 px (20.7%, one row) and 67 px (9.3%) on desktop**, and all-twelve in
one scrolling row matches 138 px on phones but is *worse* on desktop (138 px vs
67 px) while reducing choice load by zero and hiding items off-screen. Four
items is the largest set that stays on one row at 375x667; 138 px is this
header structure's floor at that width, which is why the ceilings below are set
against 138 and not against zero, and why restructuring the sync/help/theme
cluster is explicitly out of scope.

PR1 (reachability, no header change): the six orphan routes gain contextual
dashboard entries in the existing `.action-rail` / `.insights-collapsible`
vocabulary (D5), plus `src/app/__tests__/route-door-census.test.ts` (D8), which
walks `src/app` for both the `href="/x"` and `href: "/x"` forms and fails when
an `inPrimaryNav: true` route has none. **The guard-count word goes Seventeen
-> Eighteen in PR1, not PR2**: `roadmap-guard-count.test.ts` discovers suites
on disk, so the obligation belongs to the PR that adds the file - the rule
`ROUTE_VOCABULARY.md` D8 recorded after v0.22 learned it the hard way.

PR2 (the collapse): `RouteEntry` gains `navSlot: "inline" | "more"` (D6) with
`/`, `/now` and `/slicer` inline by default (D3), a native `<details>` "More"
holding the rest (D4, the same pattern as the dashboard's Workspace insights at
`page.tsx:708`), `e2e/nav-shape.spec.ts` measuring the header at three
viewports (D7), then `0.23.0` with both lockfile copies and this heading
flipped to DONE in the same commit. PR2's harness lives in `e2e/`, which
`roadmap-guard-count` does not scan, so PR2 bumps no count.

Done when, each clause checkable by CI rather than by opinion and none of them
an existence grep:

1. `route-door-census.test.ts` passes, and has been **observed failing against
   `main` at `776ab2b`** naming all six orphan routes, with the red quoted in
   PR1's body.
2. Every `inPrimaryNav: true` route is linked from at least one file that is
   neither `site-nav.tsx` nor `keyboard-help.tsx` - enforced by clause 1 rather
   than asserted in prose.
3. `src/lib/routes.ts` carries `navSlot` on every primary-nav entry, exactly
   three read `"inline"`, and `route-registry-guard.test.ts` fails when an
   entry has no slot or when the rendered header shows a different set; proven
   by a control that flips one entry's slot.
4. `e2e/nav-shape.spec.ts` asserts, at 375x667, 412x823 and 1280x720, that the
   `.site-nav-shell` height is at or under **150 / 150 / 100 px**, that every
   `.site-nav-links` child shares one `top` coordinate (one row), and that
   `document.documentElement.scrollWidth` does not exceed the viewport width;
   observed failing against `main` at the measured 264 / 222 / 180 px. All
   three clauses together, because a pixel ceiling alone is satisfied by
   shrinking the font and a row count alone is satisfied by the scrolling row
   D2 rejected.
5. The "More" disclosure is reachable and operable by keyboard alone and every
   link inside it enters the tab order once open, asserted in the same spec.
6. Every behavioral clause above is proven by a negative control whose
   perturbation is confirmed applied and whose red output is quoted, with the
   implementation committed before the first perturbation.
7. The pinned CI gate is green on both PRs (`npm run lint`, `npm run
   typecheck`, `npm run test:coverage`, `npm run build`, `npm audit
   --audit-level=high`, Node 24 per `.github/workflows/ci.yml`), the
   non-required `e2e` and `lighthouse` contexts stay green, and the Lighthouse
   CLS assertion does not regress - a header that changes height must not do it
   after first paint.
8. After PR1: the guard-count sentence reads Eighteen and names
   `route-door-census`. After PR2: `package.json` reads `0.23.0` with both
   lockfile copies matching (`lockfile-version-parity`), this heading reads
   DONE (`roadmap-milestone-status`), and the Current-state version sentence
   reads `0.23.0` (`roadmap-version-claim`, shipped by this definition and the
   reason clause 8 can no longer be half-done).

Chosen over, with the trail (full reasoning in the design doc section 5): the
flat-12 grouping taxonomy filed by PR #155 (this milestone answers "does it fit"
and "is it the only door", not "what are the categories"; `navSlot` is the field
a later `navGroup` sits beside), the silent-migration product question filed by
PR #153 (still open, still needs its own decision, and a routing milestone is
not where it belongs), the `src/app/**` behaviour-coverage finding filed by PR
#158 (a QA-stream item with its own cadence slot, not a milestone), FCM push
(console-gated, unchanged), workspace cloud sync (still deepens the unpublished
Firestore rules obligation), the `lighthouse` required-context promotion (own
dated clearing condition), and `/journal/`+`/trends/` gate widening (v0.20's
cost reasoning stands).

### v0.24 - Nine peers in a smaller box: the "More" menu gets meaning, and gets out of the way (DONE)

Defined 2026-08-08 (product-role increment), the milestone after v0.23. Design
doc: [docs/design/NAV_TAXONOMY.md](design/NAV_TAXONOMY.md). Every premise below
was **re-checked against the tree at `72b6f5a`** with the command named beside
it in the design doc, not inherited from the backlog entries that seeded it -
and one of those entries turned out to be understated. Every decision is an
overridable default.

It is where v0.23 leads. v0.22 made one registry decide WHICH doors exist;
v0.23 asked whether a person can get through them and made the header fit;
v0.24 asks what the doors MEAN, and finishes the interaction v0.23 knowingly
left half-built.

**The space answer did not produce a meaning answer.** Nine of the twelve
primary-nav routes now live behind a native `<details>` disclosure, and a
reader who opens it meets **nine undifferentiated items with no headings at
all** - where before they met twelve undifferentiated pills. `site-nav.tsx`
renders the panel as a bare `<div>` of nine `<Link>`s: `grep -cE '<h[1-6]|<ul|<li|role="group"|aria-labelledby' src/app/components/site-nav.tsx`
returns **0**, so there is no heading, no list semantics and no labelled group
in that surface, for a sighted reader or a screen reader. `NAV_SHAPE.md`
section 5 named this out of scope for v0.23 and named the field a taxonomy
would sit beside; `grep -rn 'navGroup' src/` returns nothing, so it is a plan
rather than a half-built thing.

**Five front-door routes have no `g` chord, not four.** The entry filed by PR
#160 names `/slicer`, `/ambient`, `/breathe` and `/challenges`; re-read at the
source, `/pricing` has none either. `grep -cE '^  \{ path: .*inPrimaryNav: true' src/lib/routes.ts`
is **12** and `grep -c 'goToKey: "' src/lib/routes.ts` is **7**. The earlier
count is legibly wrong rather than carelessly wrong: it was filed by the
increment that closed the ORPHAN-ROUTE bug, and `/pricing` was never an orphan
because the paywall links to it, so it fell outside that increment's frame and
outside the sentence it left behind. The frame was right for that bug and wrong
as a census. The letters `s`, `a`, `b`, `c` and `p` are all unclaimed.

**The disclosure is a menu that cannot be dismissed.** `NAV_SHAPE.md` D4 chose
`<details>` over a popover and recorded both costs before shipping: it closes
on neither `Escape` nor an outside click. That cost is now paid by every reader
on every page. `grep -cE 'addEventListener|useEffect|onKeyDown|onBlur' src/app/components/site-nav.tsx`
returns **0** - the component has no document-level listener of any kind. The
pattern to copy is one component away and already tested:
`keyboard-help.tsx` closes on `Escape` at line 133 and restores focus through
`restoreFocusRef`.

**COMPLETE 2026-08-08** (PR #164 + PR #166). PR1 shipped D2-D6 and D8; PR2
shipped D7, the browser dismissal clause and the `0.24.0` bump, which is what
flips this heading. One design clarification came out of implementing PR1 and is recorded
in `NAV_TAXONOMY.md` D3: "registry order" for the categories means the order
they first appear in the WHOLE registry, not in the subset a surface renders.
Ordering each surface by its own list puts **In the moment** first in the panel
(which holds no `/` and no `/now`) and **Today** first in the keyboard dialog -
two surfaces teaching a reader two different shapes for the same twelve routes,
with no drift for a drift guard to find. Clause 4's "in the same order as the
panel" caught it red before it shipped; `navGroupOrder()` is the fix.

PR1 (the registry gains meaning): `navGroup` on every `inPrimaryNav: true`
entry and on no other (D2), the four groups Today / In the moment / Looking
back / Account (D3), the panel rendering one `aria-labelledby`-labelled `<ul>`
per group that has a `more` member (D4), the keyboard dialog adopting the same
groups because it reads the same registry (D5), and chords for the five routes
without one (D6). PR2 (the disclosure behaves like a menu): `Escape` and an
outside click close it with focus returning to the `<summary>` (D7), the E2E
assertion, then `0.24.0` with both lockfile copies and this heading flipped to
DONE in the same commit.

**No PR in this milestone adds or removes a `.test.ts` under `src/__tests__`
or `src/app/__tests__`** (D8): every new assertion extends
`src/app/__tests__/route-registry-guard.test.ts`, and PR2's browser assertion
lands in `e2e/`, which `roadmap-guard-count` does not scan. So the guard-count
word stays **Nineteen** and no count obligation is schedulable in either
direction. That is stated here at definition time rather than discovered at
implementation time, which is what `ROUTE_VOCABULARY.md` D8 cost when v0.22
learned it the hard way.

Done when, each clause checkable by CI rather than by opinion and none of them
an existence grep:

1. `route-registry-guard.test.ts` fails when an `inPrimaryNav: true` entry
   carries no `navGroup` AND when a non-primary-nav entry carries one, proven
   by a control that removes one group and adds one to `/monetization`, with
   both reds quoted in PR1's body.
2. The rendered "More" panel contains exactly the headings of the groups that
   have at least one `navSlot: "more"` member, in registry order, and every
   `more` route is inside the labelled list of its own group - asserted against
   `ROUTES` rather than a literal list of names, and proven by a control that
   makes the RENDERER stop honouring `navGroup` and reddens it.

   > **Corrected by PR1, 2026-08-08, having been run and observed GREEN.** This
   > clause originally prescribed "a control that moves one route to a
   > different group and reddens it". That control was run - `/journal` moved
   > from `Looking back` to `Today` in `src/lib/routes.ts`, perturbation
   > confirmed by `git diff` - and the whole guard stayed **26/26 green**,
   > because both the rendering and the expectation are derived from the same
   > registry field, so a registry edit moves both sides at once. It is the
   > same vacuity class the backlog entry filed by PR #157 describes and the
   > reason PR2 of v0.22 had to replace an equality assertion. A registry edit
   > is a SPECIFICATION change, not a defect, and no derived guard can call it
   > one; what a guard can catch is a renderer that stops reading the field,
   > which is what the corrected control perturbs. The unfalsifiable half -
   > "is `/journal` really Looking back?" - has no mechanical home today and is
   > filed as an open backlog item with a doc-table drift guard as its
   > candidate close condition.
3. Every `inPrimaryNav: true` route carries a `goToKey`, the existing "assigns
   each chord key to exactly one route" assertion still holds across all
   twelve, and `g <key>` calls `router.push` with that entry's path for every
   one of them - the existing chord-routing assertion covering the five new
   chords automatically, plus an explicit assertion that the chordless
   primary-nav set is empty.
4. The keyboard dialog renders its "Go to" rows under the same group headings
   in the same order as the panel, derived from the registry in both places,
   and the five hand-authored non-navigation rows are unchanged.
5. `Escape` while the disclosure is open closes it and moves focus to its
   `<summary>`; a pointer-down outside the disclosure closes it. Each proven by
   its own control that removes that one handler and quotes the red, so neither
   assertion can be passing because of the other.
6. `e2e/nav-shape.spec.ts` still passes its 150 / 150 / 100 px ceilings at
   375x667, 412x823 and 1280x720 with the one-row and no-horizontal-scroll
   clauses intact - a grouped panel must not grow the CLOSED header - plus a
   new clause asserting in a real browser that the disclosure is closed after
   `Escape`.
7. Every behavioural clause above is proven by a negative control whose
   perturbation is confirmed applied and whose red output is quoted, with the
   implementation committed before the first perturbation.
8. The pinned CI gate is green on both PRs (`npm run lint`, `npm run
   typecheck`, `npm run test:coverage`, `npm run build`, `npm audit
   --audit-level=high`, Node 24 per `.github/workflows/ci.yml`), the
   non-required `e2e` and `lighthouse` contexts stay green, and the Lighthouse
   CLS assertion does not regress.
9. After PR2: `package.json` reads `0.24.0` with both lockfile copies matching
   (`lockfile-version-parity`), this heading reads DONE
   (`roadmap-milestone-status`), and the Current-state version sentence reads
   `0.24.0` (`roadmap-version-claim`). The guard-count word is still
   **Nineteen** and `roadmap-guard-count` is green without either PR touching
   it.

Chosen over, with the trail (full reasoning in the design doc section 5): the
sync/help/theme cluster restructure filed by PR #159 (worth ~40 px on phones
only, its own surface, its own before/after obligation - and folding it in
would make neither measurable), swapping `<details>` for the popover D4 priced
(D7 buys the two behaviours without the swap), a visual redesign of the panel
(a taxonomy whose evidence is tangled with a restyle is one nobody can
evaluate), the silent-migration product question filed by PR #153 (unrelated
surface, own decision), the `e2e` required-context promotion (a DevSecOps item
with its own dated clearing condition and an evidence step written down), the
`src/app/**` behaviour-coverage finding filed by PR #158 (a QA-stream item with
its own cadence slot), FCM push (console-gated, unchanged), workspace cloud
sync (still deepens the unpublished Firestore rules obligation), and
`/journal/`+`/trends/` gate widening (v0.20's cost reasoning stands).

## Later / candidates (unscheduled)

Valid direction from AUTONOMOUS_IMPLEMENTATION_PLAN.md Phases 4 to 6 and the
monetization ladder, plus housekeeping. Nothing here is scheduled; **v0.2
through v0.24 have all landed, so the dev queue is EMPTY and the next product
slot defines v0.25.** v0.22
completed 2026-08-07 (PR #156 the `src/lib/routes.ts` registry with the nav
derived from it, PR #157 the keyboard dialog derived from it), so the four
independent hardcoded route lists are one, `/now` is reachable from every page
by nav link and by `g n`, and `/monetization` is out of the front door without
being deleted. v0.23 was defined 2026-08-08 on top of exactly that registry and
completed the same day: PR #160 gave the six routes that had no door outside
the header a contextual dashboard entry plus `route-door-census.test.ts`, and
PR #162 collapsed the header to three inline links plus a native "More"
disclosure driven by the registry's new `navSlot` field, taking it from
264 px (39.6% of a 375x667 viewport, four rows of pills) to 138 px (20.7%, one
row) and from 180 px to 67 px at 1280x720, with `e2e/nav-shape.spec.ts`
measuring it in chromium against the real export. v0.24 was defined
2026-08-08 on top of exactly that disclosure and completed the same day:
PR #164 gave the registry a `navGroup` field, so the nine routes behind "More"
render as four labelled lists in the panel and under the same four headings in
the keyboard dialog, and the five chordless front-door routes got `g s`, `g a`,
`g b`, `g c` and `g p`; PR #166 made the disclosure dismissable, so `Escape`
closes it and returns focus to its summary and a pointer-down outside closes
it, each proven by its own control and re-asserted in chromium. This sentence is
the part `roadmap-milestone-status.test.ts` cannot mechanically check and
therefore is most likely to go stale. (Corrected eighteen times now, three on
2026-07-26; the ninth edition by the v0.19 completion PR that flips the
heading alongside the flip, closing the "one increment late" gap the
2026-07-27 note above first asked for, the tenth by the increment that
defined v0.20 one day later, the eleventh by v0.20 PR1, which retired the
two-numbers caveat, the twelfth by the 2026-08-07 product pass that
defined v0.21, the thirteenth by the 2026-08-07 product pass that
defined v0.22 hours after v0.21 shipped, the fourteenth by v0.22 PR2,
the completion PR, which flips the heading and this sentence together rather
than leaving the second half a slot behind, the fifteenth by the
2026-08-08 product pass that defined v0.23, the sixteenth by v0.23 PR2,
the completion PR, which again flips the heading and this sentence together,
the seventeenth by the 2026-08-08 product pass that defined v0.24 hours
after v0.23 shipped, and this eighteenth by v0.24 PR2, the completion PR,
which flips the heading and this sentence together for the third milestone
running.
`roadmap-milestone-status.test.ts`
guards the milestone HEADINGS mechanically but cannot read this sentence,
which is why it is the half that keeps going stale. Its sibling half - the
Current-state "package.json reads x.y.z" claim - stopped being prose on
2026-08-08: `roadmap-version-claim.test.ts` now reads it against
`package.json`, so of this file's two chronic staleness generators only this
one is still unguarded.)

- Reminder reach expansion: real push notifications via Firebase Cloud
  Messaging (still BaaS-only, no dedicated server), identified as a
  candidate while scoping v0.11 (see
  [docs/design/TRENDS_OVER_TIME.md](design/TRENDS_OVER_TIME.md) section 1).
  Needs a service worker plus console-side FCM/VAPID-key setup, so it carries
  multiple USER-ONLY gates before any code is exercisable - not agent-doable
  now, unlike the milestones above it. (Re-checked at the v0.17 definition,
  2026-07-26: unchanged, still console-gated.)
- ~~Performance optimization pass (v0.19+): bundle analysis, Firebase SDK load
  optimization, code-split tuning (AUTONOMOUS plan Phase 4)~~: **promoted into
  v0.19 above (2026-08-01)**; no longer just a candidate. It had been the
  standing runner-up since v0.12, deferred every time on "no web-vitals baseline
  exists, so 'faster' is not CI-checkable"; v0.18 retired that objection on
  2026-08-01 and its first measurement named the targets the same day. The
  "code-split tuning" half of the original wording is carried forward in v0.19's
  D4 (defer Firebase, split Firestore from Auth); "bundle analysis" is carried
  forward as D5's attribution gate rather than as an end in itself.
- Security hardening: replace the untouched template SECURITY.md with a real policy,
  secret scanning, dependency review (AUTONOMOUS plan Phase 5).
- ~~Playwright E2E smoke test for the daily loop~~ (AUTONOMOUS plan Phase 6):
  **promoted into v0.16 above (2026-07-26)**; no longer just a candidate. The
  PR-template half of this entry's original wording was deliberately NOT
  promoted with it (v0.16 decision D6: repo hygiene, not E2E) and stays here on
  its own line below.
- A PR template (the other half of the old Phase 6 candidate). Repo hygiene,
  small, unscheduled.
- ~~Remove the dead reminder-email helper src/lib/mailer.ts plus its nodemailer
  dependency once the reminder design settles~~: DONE 2026-07-26 (PR #119,
  DevSecOps stream). The condition it was waiting on had been satisfied since
  v0.3: `docs/design/REMINDER_SCHEDULING.md` rejected the email-cron path, so
  nothing was left to resurrect the helper for. The same pass removed
  `src/lib/checkins.ts`, a second pre-static-export leftover that wrote
  `.data/checkins.json` through `node:fs`, and added
  `src/__tests__/static-export-surface.test.ts` so an unimported production
  dependency or a new Node built-in import fails CI instead of aging quietly.
- Paid value expansion (advanced weekly narratives, cloud restore): deferred until
  entitlement automation ships.
- ~~checkinStatus dashboard persistence (LOW bug)~~: FIXED via PR #90
  (2026-07-20). The ProgressRing no longer resets to 50 percent on reload; a
  `checkedIn` field on `SavedPlannerState` now persists and rehydrates the
  same 100 percent check-in state through the existing localStorage blob.
  Considered and set aside for v0.9 proper in favor of journal sync, then
  picked up as a standalone QA-stream fix instead, exactly as this entry
  originally anticipated.
- ~~Gratitude journal cloud sync~~: promoted out of this list into v0.9 above
  (2026-07-20); no longer just a candidate.

## Blocked and user-only summary

Blocked (with reasons):

- ~~Reminder delivery v1 (v0.3): blocked on the v0.2 design doc being approved by the
  user~~ - **no longer blocked; v0.3 SHIPPED 2026-07-19** as PR #80 (`.ics` calendar
  channel) plus PR #81 (OS Notification API). This entry, and the "BLOCKED until the
  v0.2 reminder design doc merges" line that still headed the v0.3 section above, were
  both stale for six days; corrected 2026-07-25. A static GitHub Pages site still
  cannot run a background scheduler itself, which is why both shipped channels are
  client-side.
- Stripe webhook entitlement implementation: blocked on the v0.5 design doc approval
  and on the user provisioning Firebase Functions billing; a static site cannot
  receive webhooks. As of 2026-07-19, v0.5 itself is deprioritized per the user's
  frontend/UI-UX direction, so this has no active target date at all right now.
- Rust coach bridge deployment (`NEXT_PUBLIC_RUST_COACH_BRIDGE_URL`): blocked because
  no coach-bridge service exists anywhere and this repo is a static export with no
  backend of its own. (Corrected 2026-07-25: this entry used to justify the block with
  a claim that "the portfolio GCP/Fly infrastructure was decommissioned to zero on
  2026-06-04." That premise was not re-verified for this audit and is not what blocks
  the item, so it has been removed rather than restated. The block rests only on the
  fact that no bridge service has ever been written or hosted.) This repo itself
  (GitHub Pages plus Firebase) is unaffected either way.

User-only (paid-account and console actions an agent must not perform):

- Create the $5/month Stripe Payment Link and set the repository variable
  `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`.
- Flip `subscriptionStatus` to "active" in Firestore for real paying users until
  webhook automation ships.
- Deploy Firestore security rules in the Firebase console (ruleset documented in
  docs/FIRESTORE_RULES.md).
- Confirm Firebase quotas and billing. (Corrected 2026-07-26: this read "before
  the v0.4 default flip", a condition that can no longer be met - v0.4 shipped
  2026-07-19 as PR #82 and `NEXT_PUBLIC_CHECKIN_BACKEND` has resolved to
  Firestore-for-signed-in-users ever since. The obligation is real and still
  open, but it is now a running-cost check rather than a pre-flip gate, and no
  real user has exercised it yet because the rules below are still unpublished.)

## History and supersession

- docs/FRONTEND_FUNCTIONALITY_PLAN.md: all six priority items shipped; weekly
  insights, browser reminders, and offline/sync status landed on 2026-07-18. The doc
  is now a historical completion log. Its "start with the dashboard action rail"
  starting point shipped long ago.
- docs/AUTONOMOUS_IMPLEMENTATION_PLAN.md: Phases 1 to 3 are done except Phase 3
  item 4 (server-side scheduled reminders), which became the v0.2/v0.3 reminder
  design work; Phases 4 to 6 are folded into "Later / candidates" above. Its progress
  log stops at 2026-06-27 and misses everything from PR #52 onward, including ambient
  audio (PR #52), micro challenges (PR #53), guided breathwork (PR #56), the Focus rebrand
  (PR #59), the ADHD Task Slicer (PR #61), and the dev-agent automation platform
  (PRs #63 through #70).
- docs/MONETIZATION_PLAN.md: the single $5/month membership (header updated 2026-07-18)
  replaced the Free/Pro/Team feature-gate and Starter/Pro/Team metrics framework;
  those sections are retired. Ladder steps 4 and 5 (entitlement controls, paid value
  expansion) carry forward as v0.5 and "Later / candidates".
- Challenge streaks shipped in PR #53 were deliberately removed in PR #73 to honor the
  no-streak-pressure promise; any roadmap item implying streaks is off-limits.
- 2026-07-20 roadmap audit (product-role increment): this document had no v0.8 section
  at all despite v0.8 (PR #87, accessibility pass) being merged and package.json reading
  0.8.0, and it did not mention the 2026-07-19 frontend-direction memo anywhere, so a
  reader could not tell v0.5 was deprioritized from this file alone. Both are corrected
  above. The backlog's v0.9 ("paid-value expansion," gated on v0.5 approval) was also
  found to be stuck behind a deprioritized dependency with no re-approval date; v0.9 is
  re-slotted to gratitude journal Firestore sync (see v0.9 above and
  [docs/design/JOURNAL_FIRESTORE_SYNC.md](design/JOURNAL_FIRESTORE_SYNC.md)), and paid-value
  expansion remains valid future direction under "Later / candidates," unchanged.
- 2026-07-20 roadmap re-audit (product-role increment, second pass same day):
  verified PRs #88, #89, and #90 (roadmap audit, journal sync implementation,
  and its QA hardening) via `gh pr view --json mergedAt,mergeCommit` before
  writing anything, then found this document still described the gratitude
  journal as "localStorage-only" in the Current state section and still
  carried v0.9's done-when as an open checklist despite both PRs being merged
  and package.json reading 0.9.0 - both corrected above. Also found the
  "Later / candidates" checkinStatus bug entry stale in the other direction:
  it described the bug as unfixed and deferred, when PR #90 (same day) had
  already fixed it; struck through and marked FIXED. v0.10 (theme
  consistency) defined below and in
  [docs/design/THEME_CONSISTENCY.md](design/THEME_CONSISTENCY.md) after
  auditing the unscheduled candidates and finding none milestone-shaped as
  worded; the audit that produced v0.10 read the app's real component code
  and CSS rather than proposing polish in the abstract.
- 2026-07-20 milestone definition (product-role increment): v0.10's own
  header still read "(agent-doable now)" despite PRs #93 and #94 both being
  merged and package.json reading 0.10.0 - corrected to "(DONE)" above with
  the same DONE-bullet treatment v0.8/v0.9 already use. v0.11 (Trends: a
  longer-horizon insight view) defined below and in
  [docs/design/TRENDS_OVER_TIME.md](design/TRENDS_OVER_TIME.md), chosen over
  four other candidates (closing the journal guest-migration gap, expanding
  reminder reach via push notifications, planner forward-planning, and
  journal/check-in cross-referencing) specifically for being a genuine new
  surface with no backend, no new Firestore rule, and no console gate
  standing in front of it. Tracing the current 7-day-only "trend" ceiling
  also surfaced a real bug (`review/page.tsx` reads check-in history via a
  direct `browser-checkins.ts` call instead of the `CheckinStoreAdapter`, so
  its week-over-week and skip-reason panels silently show empty data for
  signed-in Firestore-synced users) - filed in the backlog `## Bugs` section,
  not fixed here, and the new milestone's own technical plan is written to
  avoid repeating it.
- 2026-07-25 roadmap truth pass + milestone definition (product-role
  increment, second product pass this day after PR #108). PR #108 corrected
  v0.11's header and defined v0.12; this pass audited the whole document
  against real `gh` state (`gh pr view 78/79/80/81/82/83/84/85/109/110 --json
  state,mergedAt` before writing anything) and found **six** sections still
  describing shipped work as future work:
  - v0.2, v0.4, v0.6, and v0.7 still carried "target week of ..." headers
    although every one of them had merged on 2026-07-19 (PRs #78/#79, #82,
    #83/#84, #85). Corrected to DONE headers with PR citations, matching the
    v0.8-v0.11 treatment. The "target week" dates were also the last
    calendar-sized planning left in this file; agent throughput does not track
    a weekly cadence, so dependency order and user gates are the only
    sequencing constraints that remain.
  - v0.3 was worse than stale, it was **false**: its section still opened
    "BLOCKED until the v0.2 reminder design doc merges with user sign-off" and
    carried a "BLOCKED (design approval)" bullet, six days after v0.3 shipped
    in full as PR #80 (`.ics` calendar channel) plus PR #81 (OS Notification
    API). A reader of this file alone would have concluded the reminder track
    was frozen. The matching entry in "Blocked and user-only summary" was
    stale in the same direction and is now struck through.
  - v0.12's header still read "(agent-doable now)" although PR #109 and PR
    #110 had both merged and package.json reads 0.12.0 - the exact defect PR
    #108 had just corrected for v0.11, recurring one milestone later.
  Also removed an unverified premise: the Rust-coach-bridge blocked entry
  justified itself with "the portfolio GCP/Fly infrastructure was
  decommissioned to zero on 2026-06-04." That claim was inherited, not
  re-checked, and is not what blocks the item; the entry now rests only on the
  fact that no bridge service exists.
  **v0.13 defined** (guest-to-account migration for journal entries and focus
  sessions, see [docs/design/GUEST_DATA_MIGRATION.md](design/GUEST_DATA_MIGRATION.md)),
  chosen over FCM push (USER-ONLY console gates), a performance pass (still no
  web-vitals baseline), Playwright E2E (QA stream), and the `mailer.ts` removal
  (hygiene). The audit that produced it read the three store modules rather
  than the changelog, which is how it found both the gap itself (journal and
  focus sessions carve migration out in their own module docs) and a real
  hazard in the obvious implementation (`saveJournalEntry` upserts by date, so
  copying the check-in migration verbatim would let a guest entry overwrite an
  account entry silently).
- 2026-07-25 roadmap truth pass + milestone definition (product-role increment,
  third product pass this day, after PRs #108 and #112). Verified PR #113 and
  PR #115 MERGED via `gh pr view --json state,mergedAt` before writing, then
  corrected v0.13's header from "(agent-doable now)" to "(DONE)" - **the third
  consecutive milestone to ship that exact defect** (PR #108 fixed it for v0.11,
  PR #112 for v0.12, this pass for v0.13). Because a defect that recurs three
  times is a missing check rather than a missing reminder, this pass also added
  `src/__tests__/roadmap-milestone-status.test.ts`, which reads THIS file and
  `package.json` together and fails when a milestone at or below the shipped
  version is not marked DONE or DEPRIORITIZED (and when a milestone above it
  claims DONE). The prose fix and the guard shipped in the same PR.
  Two Current-state bullets were also corrected: the persistence bullet still
  said guest migration existed "for check-ins only" although v0.13 extended it
  to journal entries and focus sessions the same day, and the version line still
  read 0.12.0. A new Access bullet records something no previous audit had
  written down: **the deployed build gates every route behind Google sign-in**,
  verified against the live bundle rather than assumed, which makes v0.13's
  user-visible value unreachable in production.
  **v0.14 defined** (guest access and a reachable checkout, see
  [docs/design/GUEST_ACCESS_AND_PAYWALL.md](design/GUEST_ACCESS_AND_PAYWALL.md)),
  chosen over FCM push, a performance pass, Playwright E2E, the `mailer.ts`
  removal, and extending guest migration to planner state. The audit that
  produced it found that three "Continue with Google" buttons already exist
  inside the app (`page.tsx:618,667`, `focus/page.tsx:60`, `pricing/page.tsx:85`)
  that no signed-out visitor has ever been able to reach, because the wall
  preempts every one of them - so the invitation-shaped alternative to the wall
  is already built.
- 2026-07-26 milestone definition + truth pass (product-role increment, wave):
  the drift guard added in the previous pass now covers the milestone headers
  mechanically, so this pass targeted what the guard cannot read - the
  Current-state prose and the unscheduled lists. It found four stale statements.
  (1) The "Later / candidates" preamble still read "v0.2 through v0.13 have all
  landed, and v0.14 above is the next milestone" after v0.14 shipped, which is
  the same shape as the header defect the guard now catches, one paragraph
  outside its reach. (2) The Quality-gate bullet described CI as PR #86 left it
  on 2026-07-19 and mentioned neither of the two DevSecOps increments that have
  extended it since - the daily `security-audit.yml` detector (PR #111) and the
  static-export surface guard (PR #119) - so a reader could not tell from this
  file that five guard tests now run inside the gate; the required context was
  re-read live (`["lint-and-build"]`) rather than restated. (3) The user-only
  entry "confirm Firebase quotas and billing **before the v0.4 default flip**"
  named a condition that can no longer be met, v0.4 having shipped on
  2026-07-19; the obligation is real and still open, so it was re-stated as a
  running-cost check rather than deleted. (4) The Current-state header still
  read 2026-07-25 while carrying 2026-07-26 content. **v0.15 defined** (first
  run: the front door a stranger actually meets, see
  [docs/design/FIRST_RUN.md](design/FIRST_RUN.md)), chosen over FCM push, a
  performance pass, the planner/slicer migration extension, and Playwright E2E.
  The Playwright entry is the one this pass changed its mind about: the
  objection recorded against it in the v0.14 definition expired the moment v0.14
  shipped, so it was re-costed rather than deferred by habit, and it lost on
  ordering alone (a browser suite written now would pin the first-run path with
  its defects intact). The audit behind v0.15 was done by reading the source and
  the live deployment, not the changelog: `grep -rn "authMessage" src/app` finds
  the failure message rendered on exactly one of the three routes that offer
  sign-in, `find src/app -name page.tsx` against `ls src/app/__tests__` finds
  `/focus` the only untested route, and `curl` against the deployed `/` finds
  neither the onboarding overlay nor the guest badge in the prerendered HTML,
  which is what makes the hydration mismatch a first-time-visitor-only defect
  and therefore one that could not have mattered before v0.14 opened the door.
