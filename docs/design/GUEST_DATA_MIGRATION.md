# Bring your data with you: guest-to-account migration for journal + focus sessions (v0.13)

This is the product-analyst definition of the next milestone. Like the v0.10
(THEME_CONSISTENCY.md), v0.11 (TRENDS_OVER_TIME.md) and v0.12
(FOCUS_IN_TRENDS.md) design docs before it, every choice below is an
**explicitly flagged, overridable default**, so the user can accept the whole
milestone with one word or redirect any single decision without unpicking the
rest. Nothing here is a hard review gate.

## 0. Why this document exists

v0.12 completed on 2026-07-25 (PR #109 focus card + PR #110 optional Firestore
sync), `package.json` reads `0.12.0`, and `docs/ROADMAP.md` ended at v0.12 with
no next milestone. The development stream therefore had nothing topmost and
actionable, which is the product slot's standing trigger: *when a milestone
completes, define the next one with a done-when checkable by build, test, or
CI.*

## 1. Candidates considered

| Candidate | Verdict |
| --- | --- |
| **Guest-to-account migration for journal + focus sessions** | **CHOSEN.** A real, user-visible data gap that this repo has now deferred twice, in writing, in two different modules. Frontend/BaaS-only, no new env var, no new Firestore collection, no new rule, no console gate. Milestone-sized at 2 PRs. |
| Reminder reach via Firebase Cloud Messaging | Rejected again: needs a service worker plus console-side FCM/VAPID setup, so it carries USER-ONLY gates before any code is exercisable. Same verdict as v0.11 and v0.12. |
| Performance pass (bundle analysis, web-vitals) | Rejected again: no baseline instrumentation exists, so "faster" is not checkable by CI without a preceding instrumentation milestone. Stays in Later. |
| Playwright E2E smoke test for the daily loop | Rejected: QA-stream work, not a product milestone. Stays in Later, unclaimed. |
| Remove dead `src/lib/mailer.ts` + nodemailer | Rejected: hygiene, not a user-visible milestone. Good filler for a DevSecOps or QA slot. |

## 2. What is actually there today (the audit)

Verified by reading the code on 2026-07-25, not inherited from prose:

- **Check-ins DO migrate.** `src/lib/checkin-store.ts` exposes
  `migrateGuestCheckins(targetScopeKey)` with an idempotency marker
  (`calm-daily-coach-migrated-guest:<scope>:<backend>`), a `skipped` /
  `already-migrated` / `migrated` / `error` result, and a fallback to the local
  adapter when the Firestore path throws. It is wired through
  `src/lib/planner-session.ts` (which turns the result into a calm one-line
  `migrationStatus`) and surfaced by `src/app/hooks/use-coach-planner.ts`.
- **Journal entries DO NOT migrate.** `src/lib/journal-store.ts` says so in its
  own module doc: *"Explicitly out of scope for v0.9: migrating existing guest
  localStorage entries into a signed-in scope (tracked as a named follow-up,
  not silently dropped)."*
- **Focus sessions DO NOT migrate.** `src/lib/focus-session-store.ts` repeats
  the same carve-out for v0.12.

So the user-visible defect is: a person who journals or runs `/now` focus
sessions while signed out, then signs in, sees an empty journal and a zeroed
"Focus sessions this week" card, while their real entries sit intact in
guest-scoped localStorage. Their check-ins, by contrast, follow them across.
The app is internally inconsistent about its own promise.

**One real hazard the audit surfaced, which shapes the plan.** The existing
check-in migration copies every guest record unconditionally; it has no
conflict rule. Copying that shape verbatim onto the journal would be a
**data-loss bug**, because `saveJournalEntry` (`src/lib/journal.ts:146-171`)
upserts by date: a guest entry written on the same local date as an existing
account entry would silently overwrite the account entry's text. Focus sessions
do not share the hazard (the locally generated session id is also the Firestore
document id, so a re-copy is idempotent by construction), and check-ins are
keyed by date the same way the journal is, so the rule below is written once and
applied to all three.

## 3. Technical plan

### 3.1 PR1 - one migration primitive, then journal on top of it

- New `src/lib/guest-migration.ts`: extract the guest-to-account copy loop out
  of `checkin-store.ts` into a collection-agnostic helper parameterised by
  (a) a marker namespace, (b) a "list guest records" function, (c) a "list
  account records" function used for the conflict check, (d) an identity key
  extractor, and (e) a write function.
- Refactor `checkin-store.ts` to consume it. **This half is
  behavior-preserving**, so the existing check-in migration tests must pass
  unchanged; if a test has to change, the refactor changed behavior and says so
  explicitly.
- Add `migrateGuestJournalEntries(targetScopeKey)` to `journal-store.ts` across
  all three backend branches (local / firestore / firestore-fallback), matching
  how `getCheckinsInRange` was added in v0.11.
- Wire it: `/journal` runs the migration once on first signed-in load, before
  its first read, mirroring how `planner-session.ts` sequences the check-in
  migration ahead of the weekly summary. An adapter that ships unwired is not
  shipped (the PR #89 precedent).
- `package.json` bumps to `0.13.0` in this PR.

### 3.2 PR2 - focus sessions + the one calm surface

- Add `migrateGuestFocusSessions(targetScopeKey)` to `focus-session-store.ts`
  on the same primitive.
- Wire `/now` and `/trends` through it on first signed-in load.
- One calm, non-blocking, dismiss-free line reporting the result once
  ("Your earlier entries are here now."), reusing the existing
  `migrationStatus` presentation rather than inventing a new toast surface. No
  count-shaming, no "you lost N", no error banner.
- `docs/FIRESTORE_RULES.md`: note that migration writes use the already
  documented `create` paths for `users/{uid}/journal/{entryId}` and
  `users/{uid}/focusSessions/{sessionId}`, so **no rule change and no new
  console publish is required by this milestone**. (The still-pending publish
  of the v0.9 journal block and the v0.12 focusSessions block remains
  USER-ONLY and is unchanged by this work; until it happens, the adapters'
  local fallback keeps everything working exactly as it does today.)

### 3.3 Tests

- Behavior-preserving proof: the existing `checkin-store.test.ts` migration
  tests pass unchanged against the extracted primitive.
- Idempotency: a second run returns `already-migrated` and performs zero
  writes.
- Conflict rule: a guest journal entry on a date the account already has does
  **not** overwrite the account entry (this test fails against the naive
  copy-everything implementation, which is the point).
- Marker isolation: migrating the journal does not mark focus sessions
  migrated, and vice versa.
- Backend coverage: local, firestore, and firestore-fallback branches each
  tested, mirroring `checkin-store.test.ts`.
- Non-destructive: guest-scoped localStorage still holds its records after a
  successful migration.

## 4. Product-rule guardrails (non-negotiable)

- No streaks, no counters framed as targets, no "you missed" language anywhere
  in the migration copy.
- The migration is silent when there is nothing to move. A person who never
  used the app signed out must never see a message about it.
- A failure is calm and non-destructive: local data is untouched, nothing is
  deleted, and the person is not asked to retry.

## 5. Done-when (checkable)

1. `src/lib/guest-migration.ts` exists and `src/lib/checkin-store.ts` imports
   it; `grep -c "migrateGuestCheckinsWithAdapter" src/lib/checkin-store.ts`
   shows the duplicated loop is gone.
2. The pre-existing check-in migration tests pass **unchanged**.
3. `journal-store.ts` and `focus-session-store.ts` each export a migrate
   function covering local / firestore / firestore-fallback, with tests
   mirroring `checkin-store.test.ts`'s migration coverage.
4. A test proves idempotency, a test proves the no-overwrite conflict rule, a
   test proves per-collection marker isolation, and a test proves the guest
   copy is not deleted.
5. `/journal`, `/now`, and `/trends` each run the migration through the
   adapter (a test asserts the wiring, not just the module's existence).
6. `npm run lint`, `npm run typecheck`, `npm run test:coverage`,
   `npm run build`, and `npm audit --audit-level=high` are green on the
   quality-gate check for both PRs.
7. `package.json` reads `0.13.0`.

## 6. Overridable defaults, in one place

Every line here is a default the user can flip without changing the rest.

- **D1 - Automatic, no prompt.** Migration runs on first signed-in load with no
  "bring my data?" dialog, matching how check-ins already behave. *Alternative:
  an explicit opt-in button on the account surface.*
- **D2 - Per-collection marker keys.** `...-migrated-guest:<scope>:<backend>`
  gains a collection segment (`:journal`, `:focusSessions`) rather than reusing
  the single existing key, so one collection's migration can never mark another
  as done. *Alternative: one shared marker for all three collections, migrated
  together or not at all.*
- **D3 - Account data wins on conflict.** A guest record whose identity key
  already exists on the account is skipped, never merged and never written
  over. *Alternative: newest-`updatedAt` wins, which is more clever and more
  surprising.* This default is also retro-applied to check-ins by the shared
  primitive, which is a small, deliberate behavior change to the existing
  migration and is called out as such in PR1's body.
- **D4 - The guest copy is never deleted.** Migration copies; it does not move.
  *Alternative: clear guest-scoped storage after a verified copy, which is
  tidier and irreversible.*
- **D5 - One calm line, once.** Result is reported through the existing
  `migrationStatus` channel, not a new toast or modal, and failure is silent
  rather than an error banner. *Alternative: a dismissible banner with a retry
  action.*
- **D6 - No new surface area.** No new env var, no new Firestore collection, no
  new security rule, no new dependency, no new console gate. *Alternative: a
  dedicated "your data" settings page, which is a separate milestone.*
- **D7 - Scope stops at three collections.** Check-ins, journal entries, focus
  sessions. Planner state (`SavedPlannerState`) and slicer task history are
  deliberately excluded: both are ephemeral, today-scoped working state rather
  than a record a person would miss. *Alternative: include them, which widens
  the milestone to 3 PRs.*
