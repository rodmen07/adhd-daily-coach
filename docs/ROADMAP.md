# Focus (Calm Daily Coach) - Product Roadmap

Canonical forward roadmap, last audited against real git/gh state 2026-07-26. This
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

## Current state (2026-07-26)

- App: "Focus: Your ADHD friendly self-improvement coach" (rebranded from Calm Daily
  Coach in PR #59). Next.js 16 / React 19 TypeScript static export on GitHub Pages at
  https://rodmen07.github.io/calm-daily-coach/. No server routes.
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
  them; it previously gated only lint and build. Verified 2026-07-26: the required
  context is exactly `["lint-and-build"]`, posted by that one consolidated job.
  Two DevSecOps increments have since extended the safety net around it, and this
  bullet did not mention either until now. PR #111 (2026-07-25) added
  `.github/workflows/security-audit.yml`, which runs the gate's own
  `npm audit --audit-level=high` daily; it **gates nothing** and exists because that
  command queries the live advisory database, so it had flipped an unchanged main
  red four times (#99, #101, #102, #107), each time discovered reactively by the
  next PR. PR #119 (2026-07-26) added `src/__tests__/static-export-surface.test.ts`
  after removing the last pre-static-export server code. **Six** guard tests now
  run inside the gate and compare two sources of truth rather than restating
  either: `theme-token-guard`, `static-export-surface`, `workflow-audit-parity`,
  `roadmap-milestone-status`, `onboarding-storage-contract`, and
  `auth-message-contract` (PR #123). (Corrected 2026-07-26 by the v0.16
  definition pass: this sentence was written as "five" by the v0.15 definition
  that morning and PR #123 made it six by that evening - same-day staleness in
  exactly the prose the milestone-status guard cannot read.)
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
  2026-07-26): `/trends`, a 4-week
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
  an onboarding gate whose first client render matches the prerender.
  package.json reads 0.15.0.
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
  static export under the production `/calm-daily-coach` basePath (D3), the
  vitest `exclude` for `e2e/**` with separation proven both ways (D5), the
  auto console-error tripwire with an empty reason-carrying allowlist, and
  `.github/workflows/e2e.yml` observed both red and green on its own PR while
  branch protection stayed exactly `["lint-and-build"]` (D4).
- PR2: journeys J2 and J3. J2 walks the whole daily loop (non-default focus
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
static export served under the production `/calm-daily-coach` basePath, never
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

## Later / candidates (unscheduled)

Valid direction from AUTONOMOUS_IMPLEMENTATION_PLAN.md Phases 4 to 6 and the
monetization ladder, plus housekeeping. Nothing here is scheduled; v0.2 through
v0.15 have all landed, and **v0.16 above is defined but not shipped** - when it
ships, this sentence is the one that goes stale, so the audit that closes v0.16
reads it first. (Corrected three times, twice on 2026-07-26: this paragraph read
"v0.2 through v0.13 ... v0.14 above is the next milestone" after v0.14 shipped,
"v0.2 through v0.14 ... v0.15 above is the next milestone" after v0.15 shipped,
and "no milestone is defined above them" after v0.16 was defined.
`roadmap-milestone-status.test.ts` guards the milestone HEADINGS mechanically
but cannot read this sentence, which is why it is the half that keeps going
stale.)

- Reminder reach expansion: real push notifications via Firebase Cloud
  Messaging (still BaaS-only, no dedicated server), identified as a
  candidate while scoping v0.11 (see
  [docs/design/TRENDS_OVER_TIME.md](design/TRENDS_OVER_TIME.md) section 1).
  Needs a service worker plus console-side FCM/VAPID-key setup, so it carries
  multiple USER-ONLY gates before any code is exercisable - not agent-doable
  now, unlike the milestones above it.
- Performance pass: bundle analysis, web-vitals instrumentation, Firebase SDK load
  optimization (AUTONOMOUS plan Phase 4).
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
