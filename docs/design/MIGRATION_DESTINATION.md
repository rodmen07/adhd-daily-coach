# v0.28 - The honest arrival: a migration that lands in the browser stops borrowing the cloud's sentence

Status: **SHIPPED 2026-08-10** on the defaults (section 6 was still empty at
implementation time, so every D-number below applied as written) with ONE
documented reduction: **D3's planner sentence was cut, not shipped** - see the
status note appended to D3 and the roadmap's clause 3, which carry the four
commands that falsified it. Defined 2026-08-09 (product pass).
Every decision below is an **overridable default**: the owner can accept the
lot with one word or override any D-number in section 6, and the
implementation follows section 6 over the defaults wherever they disagree.

## 1. The finding, read at the source (not inherited)

Filed 2026-08-07 by PR #153 in the backlog, re-verified 2026-08-09 at every
line this doc cites. When a signed-in person's guest data is copied to their
account, all three collection stores share one fallback shape
(`src/lib/checkin-store.ts:254`, `src/lib/journal-store.ts:186`,
`src/lib/focus-session-store.ts:192`):

```
const result = await migrateGuestRecords(<firestore plan>, targetScopeKey);
if (result.status === "error") {
  return localStore.migrateGuest<X>(targetScopeKey);   // <- succeeds
}
```

The local retry is CORRECT - a thrown Firestore write must not strand half a
history - but it returns `{ status: "migrated", migratedCount }`, the same
value a real cloud copy returns. The UI then renders the cloud's sentence:

- `/` says **"Migrated N guest check-ins to your account."** and "Brought
  today's plan along to your account." (`src/lib/planner-session.ts:38,63`) -
  an explicit account claim, false in this outcome: the records live only in
  this browser.
- `/now` and `/trends` say "Your earlier focus sessions are here now."
  (`focus-session-copy.ts:33`) - softer wording, same implication; its own
  design note (GUEST_DATA_MIGRATION.md D5) defines the line as reporting
  that the sessions **arrived**.

The `error` status these pages CAN render (v0.21 PR2 closed that silence) is
now reachable only when the local retry ITSELF throws - a quota failure -
because the fallback consumes the cloud error on its way to a local success.
So the one outcome left that the person cannot distinguish is exactly the
one where their data is not where the app just said it was. This is L-047's
shape wearing product copy: the producer's failure branch is tested and
green, while the CONTRACT - callers acting on what the status means - is
where the defect lives.

**The mitigating mechanic, verified at `guest-migration.ts:68-75`:** the
idempotency marker is keyed per `(scope, backend, collection)`, and the
fallback writes only the `local`-backend marker. The `firestore` marker
stays unwritten, so the NEXT page load retries the cloud copy. The system
already self-heals; only its sentence lies in the meantime.

## 2. What v0.28 is

**A migration that lands in the browser says so, in one calm sentence, on
the three surfaces that already report migration outcomes.** The result
vocabulary gains a `migrated-locally` status, produced by the store
adapters' fallback paths; `/`, `/now` and `/trends` render it as a notice -
not an error, because nothing the person cares about failed: their data is
safe, and the copy will be retried without them doing anything (a fact
clause 2 pins with a test rather than asserts in prose).

Not a sync engine, not a badge change, not `/journal`'s voice (D5). One PR
(D8).

## 3. Decisions (each an overridable default)

### D1. Vocabulary: a new status value, not a bolt-on field

`GuestMigrationStatus` (`src/lib/guest-migration.ts:39`) gains
`"migrated-locally"`. A `destination` FIELD on the result was considered and
rejected: every existing `status === "migrated"` check would keep compiling
and keep treating the fallback as a cloud success - the defect, preserved by
the type system. A new union member forces every consumer switch to decide,
which is the point.

`migrateGuestRecords` itself NEVER returns the new status: the primitive
does not know where its `write` lands. The mapping lives in the three store
adapters, the only code that knows it just swapped a firestore plan for a
local one.

### D2. Which paths map to `migrated-locally`

In each store's firestore-resolved adapter, both fallback paths, and only
when the local migration actually moved records (`status === "migrated"`,
any count - the count is the local retry's):

1. cloud plan returned `error` -> local retry returned `migrated`;
2. `loadFirebaseFirestore()` yielded no client (`!db`) -> local delegate
   returned `migrated`.

The `firestore-fallback` adapter (explicit `firestore` setting, Firebase
unconfigured) also maps: it is a firestore-resolved adapter whose writes
land in the browser. Live it cannot carry a signed-in scope (auth needs the
same config), so this is honesty in the type, exercised only by tests.

NOT mapped: the plain `local` backend. There the browser is the destination
by configuration; "will be copied to your account" would promise a cloud
that does not exist. `skipped` / `already-migrated` outcomes are untouched
everywhere.

### D3. The sentences (calm tone, overridable like v0.27's D6)

One new line per surface, future tense earned by clause 2's retry proof:

- `/` (check-ins): "Your earlier check-ins are safe in this browser. They
  will be copied to your account next time it can be reached."
- `/` (planner): "Today's plan is safe in this browser. It will be copied
  to your account next time it can be reached."
  **NOT SHIPPED (2026-08-10, v0.28 implementation).** Quoted verbatim above
  because the reasoning is worth keeping, but this sentence has no producer
  and nowhere to render, and the implementation cut it rather than write copy
  no code path can reach. Falsified by four commands: no `firestore-*` module
  mentions the planner at all (`grep -rln "planner" src/lib/firestore-*.ts`
  returns nothing); `migrateGuestPlannerState` pins its marker to the `local`
  backend (`planner-state.ts:180`) and writes through `persistPlannerState`,
  which **D2 excludes on purpose**; `planner-session.ts:73` renders the
  planner line only when the status is still `idle`, and any check-in
  fallback has already set `notice`; and making it reachable needs a
  discriminator ("is this app cloud-backed at all?") that no D-number names.
  The last of those is a product question, so it is filed in the backlog
  rather than answered here. Section 1's reading of `planner-session.ts:63`
  as a false account claim is the half that did not survive: the planner has
  no cloud destination to miss.
- `/now` + `/trends` (focus sessions, in `FOCUS_SESSION_COPY` where the
  existing tone guard reads): "Your earlier focus sessions are safe in this
  browser. They will be copied to your account next time it can be
  reached."

No counts (GUEST_DATA_MIGRATION.md D5's argument holds), no apology, no
instruction - the person has nothing to do. Each sentence lives where its
surface's existing migration copy lives (`planner-session.ts` literals for
`/`, `focus-session-copy.ts` for the pair), so the tone guards that already
read those homes cover the new lines with no new corpus.

### D4. Tone: notice, not error - and error keeps its bytes

The new state renders through `StatusMessage` with `tone="notice"` - per
`TONE_SEMANTICS` that is `aria-live="polite"`, no role, `text-amber-700`
(only `error` claims the alert role). An assertive alert for "everything is
safe and nothing is required of you" is the opposite of this product's
voice. The
existing `error` state keeps `tone="error"` and its exact current
sentences - the raw-quota outcome is still the alarming one.

### D5. `/journal` stays silent, and that gap gets filed, not smuggled

`/journal` ignores its migration result entirely
(`src/app/journal/page.tsx:58` awaits and discards) - success, error, and
now `migrated-locally` alike. That is a DIFFERENT defect (total silence,
the pre-v0.21 shape on a page that never spoke) with its own copy and
layout questions. Folding it in here would smuggle a new surface decision
into a truthfulness fix. It is filed as a `## Bugs` entry (MED) in the
project backlog by the defining run itself, so the obligation cannot age
inside this doc (L-016).

### D6. Retry semantics: unchanged, and finally pinned

No marker behaviour changes. What changes is that the property the D3
sentences promise becomes a test: after a fallback migration, the
`firestore` marker is absent, the `local` marker is present, and a second
run with a working cloud write returns `migrated` with the records readable
from the account plan. The future tense in D3 is not hope; it is clause 2.

### D7. Guards ride existing suites; the L-042 price is zero by construction

No new `.test.ts` under `src/__tests__` or `src/app/__tests__`: store
clauses ride `src/lib/__tests__/{checkin-store,journal-store,focus-session-store}.test.ts`
(the lib tree is outside `roadmap-guard-count`'s two scanned dirs anyway),
page clauses ride the existing `page.test.tsx`, `now`/`trends` suites, and
`planner-session` clauses ride `src/lib/__tests__/planner-session.test.ts`.
The roadmap count word stays **Twenty-two**; if the implementation adds a
scanned suite anyway it owes Twenty-two -> Twenty-three plus the names-list
entry in the SAME PR (L-042).

### D8. One PR, and controls that can actually fail

One PR: the vocabulary, three store mappings, three surface branches and
the version close are one reviewable diff, same argument as v0.27's D8.
Controls (implementation committed first, L-035; both halves quoted,
L-037):

- **(A)** revert one store's fallback mapping so it returns plain
  `migrated` -> that store's `migrated-locally` clause reds AND its page's
  notice-branch test reds (the account sentence came back on a fallback
  outcome).
- **(B)** delete one page's `migrated-locally` branch -> that page's test
  reds naming the missing notice while its siblings stay green.
- **(C)** render the new state as `tone="success"` on one surface -> the
  tone assertion reds (the emerald success class where the amber notice
  class was asserted).

Expectations compose from string literals in the tests, never from the copy
module both sides import (L-054); the store tests build their own throwing
plans rather than perturbing `guest-migration.ts`.

## 4. Why this and not the other candidates

- **The C10 refactor split** (`route-registry-guard.test.ts`, 1036 lines,
  preflight-flagged this run): a behaviour-preserving split is a
  refactor-trigger increment with a stricter bar, not a product milestone;
  filed as its own backlog item this run.
- **The `src/app/**` behaviour-coverage MED and the rendered-DOM
  theme-guard gap**: QA-stream work with its own cadence slots (unchanged
  from v0.27's chosen-over).
- **`/journal`'s total migration silence**: D5 - a new-surface decision,
  filed rather than folded in.
- **FCM push**: still console-gated, not agent-doable (re-checked against
  the ROADMAP candidate entry, unchanged).
- **PR template / hygiene items**: not milestones.
- v0.27's own chosen-over list named this item "a product decision the
  analyst may not make unilaterally" - which is exactly what this doc is
  for: every decision above is overridable in section 6 before a line of
  implementation exists.

## 5. Explicitly not in scope

- `SyncStatusBadge`: it reports backend RESOLUTION, not migration outcomes;
  widening its vocabulary is a separate decision.
- Any change to `migrateGuestRecords`'s marker or conflict-guard semantics.
- Any retry scheduling beyond the existing next-load retry.
- `og`/metadata, nav, or any rendered-DOM change outside the three status
  branches: `e2e/nav-shape.spec.ts` must pass byte-for-byte unchanged.

## 6. Owner overrides

(Empty until the owner weighs in. Defaults above apply.)
