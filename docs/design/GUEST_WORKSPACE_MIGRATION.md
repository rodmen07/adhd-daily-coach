# v0.17 - Sign-in keeps your workspace: slicer history and today's plan cross over

Status: PROPOSED (defined 2026-07-26, product-role increment). Every decision
below is an overridable default: the user can accept the lot with one word or
flip any D-number individually.

## 1. Premise, verified at source

v0.13 promised "bring your data with you" and shipped idempotent
guest-to-account migration for check-ins, journal entries, and focus sessions
on the shared `src/lib/guest-migration.ts` primitive. Its decision D7
(`docs/design/GUEST_DATA_MIGRATION.md`) stopped there, excluding planner state
and slicer task history as "ephemeral, today-scoped working state rather than
a record a person would miss."

That premise was re-checked at source for this definition instead of being
inherited, and **half of it is false**:

- **Slicer task history is durable, not today-scoped.** `SlicedTask`
  (`src/lib/slicer.ts:22-29`) carries `createdAt` and `completedAt`, and
  `loadSlicedTasks` (`slicer.ts:184-192`) parses the stored array with **no
  staleness drop of any kind** - a task sliced three weeks ago, half its steps
  checked off, loads exactly as written. A partially-completed sliced task is
  precisely "a record a person would miss": it is the externalized executive
  function this surface exists to provide.
- **Planner state really is today-scoped.** `getInitialPlannerState`
  (`src/lib/planner-state.ts`) drops a stale `plan` and a stale `checkedIn`
  record from a previous day on read, by design. D7 was right about this half
  - but "today-scoped" still bites on the one day that matters most, see
  below.

What makes this worth a milestone NOW rather than in v0.13: until PR #121
(2026-07-26) a signed-out person could not reach the app at all, so nobody
could accumulate a guest workspace. The front door is open, sign-in is sold as
an upgrade on `/`, `/focus`, and `/pricing`, and the moment of conversion is
exactly when the app currently discards the most:

- `/slicer` keys storage by `authUser?.uid ?? "guest"` (`slicer/page.tsx:19`)
  and reloads on scope change (`:43-45`), so the instant sign-in resolves, a
  guest's entire task list visibly vanishes (it stays under the guest key, but
  nothing ever reads that key again for this person).
- The dashboard ring resets at sign-in even though the check-in itself
  migrates. The check-in RECORD crosses over via `migrateGuestCheckins`
  (v0.4), but the ring reads `SavedPlannerState.checkedIn`
  (`planner-state.ts:12`), which lives in the scope-keyed planner blob that
  does not cross. A guest who checks in, likes the product, and signs in
  watches their completed day drop back to 50 percent at the exact moment of
  maximum trust. This is the same defect class PR #90 fixed for reload,
  reappearing at the sign-in boundary.

## 2. What v0.17 is

Extend guest-to-account migration to the two workspace stores v0.13 left
behind, on the primitive it already built. No new surface, no new sync - both
stores are and remain localStorage-only; this is a copy across scope keys on
one device, which is exactly where a guest's workspace lives.

## 3. Decisions (every one an overridable default)

- **D1 - Scope: slicer task history and same-day planner state. Nothing
  else.** The `defaultTheme` dead-field LOW stays out: it is a
  collected-then-dropped preference, not workspace data, and its two honest
  fixes point opposite ways (wire it back or stop collecting it) - that is
  its own product call, left as a candidate. *Alternative: fold it in as a
  third slice.*
- **D2 - Slicer rides the existing primitive; planner gets a sibling
  single-record helper in the same module.** `migrateGuestRecords` is built
  for listable collections (lister + optional conflict guard + per-record
  writer). Slicer history fits it exactly. Planner state is one blob per
  scope, not a list, so forcing it through the list shape would be
  contortion; instead `guest-migration.ts` gains a small
  `migrateGuestSingleRecord` (same four-state `GuestMigrationResult`
  contract, same marker rule, same marker-unset-on-error retry) so the two
  paths share vocabulary and tests rather than drifting. *Alternative: wrap
  the blob in a one-element list and reuse `migrateGuestRecords` verbatim.*
- **D3 - Account wins, everywhere, non-destructively.** Slicer: identity is
  the task `id` (locally minted at creation); a guest task whose id the
  account scope already holds is skipped, everything else is appended.
  Planner: the guest blob is copied ONLY when the account scope has no live
  same-day state of its own (a stale account blob counts as absent, matching
  the read-side staleness rule). Guest copies are never deleted, matching
  v0.13 exactly. *Alternative: merge field-by-field on the planner blob -
  rejected as undebuggable.*
- **D4 - Marker keys extend the v0.13 shape with new collection segments.**
  `guestMigrationMarker(scope, "local", "slicer")` and
  `guestMigrationMarker(scope, "local", "planner")`, i.e.
  `calm-daily-coach-migrated-guest:<scope>:local:slicer` / `:planner`. The
  backend segment is a literal `"local"` because these stores have no backend
  resolution - there is no Firestore surface here (D6). The v0.4 legacy
  collection-less key is untouched, and a test pins each new key's exact
  bytes, the PR #113 precedent. *Alternative: one shared `:workspace` marker
  for both - rejected: one collection's migration must never mark another as
  done (the documented D2 rule in guest-migration.ts).*
- **D5 - Where it runs.** Slicer migration runs in `/slicer`'s scope-change
  load (`slicer/page.tsx:43`) before the account scope's first read - the
  same before-first-read sequencing `/journal` uses (PR #113). Planner
  migration runs inside `hydratePlannerSession` (`planner-session.ts`)
  alongside `migrateGuestCheckins`, before the hydrated state reaches the
  ring. Outcomes surface through the existing calm one-line
  `migrationStatus`; no new banner, no new component. *Alternative: a single
  app-level migration orchestrator - a refactor with no user-visible value,
  rejected.*
  **Shipped form for the slicer half (2026-07-27, v0.17 PR1) - a deliberate,
  narrow divergence from the letter of this default.** `/slicer` reads
  synchronously in the render phase (its documented "adjust state when a
  prop changes" pattern), and the shared primitive is async, so the
  migration cannot literally precede that first read without deferring every
  load of this page behind an async gate it otherwise does not need. What
  ships: the migration runs on the same scope change, and when it actually
  moved tasks the list is re-read in the same load. The guarantee D5 exists
  for - a guest's tasks are visible in the load where sign-in resolves, not
  after a manual refresh (the exact bug PR #115's sabotage (3) proved for
  `/trends`) - holds and is pinned by the page-level tests. A side effect of
  this order is strictly better than the literal sequencing for the common
  case: an account's own tasks render immediately instead of waiting behind
  the migration. The planner half of this default is untouched and PR2's.
- **D6 - No new surface area.** No new env var, no new Firestore collection
  or rule, no new dependency, no new console gate, no change to
  `docs/FIRESTORE_RULES.md`. Both stores stay localStorage-only. (Verified
  before writing: `grep -rn "firestore" src/lib/slicer.ts
  src/lib/planner-state.ts` returns nothing.) *Alternative: none proposed.*
- **D7 - Two PRs, dependency-ordered.** PR1 ships the slicer migration (the
  durable-data half, the falsified premise). PR2 ships the planner-state
  helper and wiring, closes the ring-reset-at-sign-in seam, and **carries the
  package.json bump to 0.17.0 plus the roadmap heading flip to DONE in the
  same commit**, per the `roadmap-milestone-status.test.ts` contract.
  *Alternative: one combined PR - rejected: the primitive extension in PR2
  deserves its own reviewable diff.*

## 4. What this deliberately does not do

- No Firestore sync for either store. Sliced tasks and planner state stay on
  the device; sign-in continuity is about not LOSING them, not about cloud
  backup. If a cloud story is ever wanted it is its own milestone with its
  own rules-and-console gates.
- No change to the three shipped migrations or their marker keys (the PR #113
  byte-identity pin stays authoritative).
- No touch of the D3 conflict-guard question still pending user confirmation
  in `docs/design/GUEST_DATA_MIGRATION.md` - that item stays open and
  user-gated, unchanged by this milestone.

## 5. Done when (checkable)

- [x] PR1 (2026-07-27, v0.17 PR1): `migrateGuestSlicedTasks` exists on the
      guest-migration primitive with id-identity dedupe (`src/lib/slicer.ts`);
      `/slicer` runs it in the same scope-change load, with same-load
      visibility of the migrated list pinned by test (see the D5 shipped-form
      note for the read-ordering divergence and why); a test walks
      guest-slices-then-signs-in against one mounted page and proves the list
      survives (`keeps the workspace when sign-in resolves on an already-open
      page`); a test pins the marker key's exact bytes
      (`calm-daily-coach-migrated-guest:<scope>:local:slicer`); a dedupe test
      proves an id the account already holds is skipped and the account's
      record wins.
- [ ] PR2: `migrateGuestSingleRecord` exists with the four-state contract;
      `hydratePlannerSession` copies live same-day guest planner state when
      the account scope has none; a test proves the ring reads 100 percent
      after guest-checks-in-then-signs-in; a test proves a live account blob
      is never overwritten; PR2 bumps package.json to 0.17.0 and flips the
      roadmap heading to DONE in the same commit.
- [ ] `src/lib/__tests__/checkin-store.test.ts` and the three shipped
      migrations' tests pass UNCHANGED in both PRs (the behavior-preserving
      receipt, the PR #113 precedent).
- [ ] The five pinned gate commands are green on both PRs.
