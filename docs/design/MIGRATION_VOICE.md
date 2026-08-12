# v0.30 - Every copy speaks: one migration voice, and the two surfaces that never had one

**Status:** DEFINED 2026-08-12 on `4dad1c7` (role=product, wave). Not started.
Every decision below is an overridable default; section 6 is empty until the
owner writes in it.

**Product rules this milestone is held to:** no streaks, no infinite feeds, no
pressure mechanics; calm, ADHD-friendly tone. Nothing here adds a nag - it
removes two silences and gives one existing sentence-set a single home.

---

## 1. The finding, read at the source (not inherited)

Five surfaces in the shipped app await a guest-to-account migration on load.
The census, run this pass rather than quoted from a prior one
(`grep -rn 'migrateGuest[A-Za-z]*(' src/app src/lib --include=*.ts --include=*.tsx`,
tests excluded):

| Surface | Call site | Reports the outcome? |
| --- | --- | --- |
| `/` | `src/lib/planner-session.ts:33` (check-ins), `:69` (today's plan) | yes - three branches at `:36`, `:48`, `:54` |
| `/now` | `src/app/now/page.tsx:93` | yes - three branches at `:116`, `:118`, `:120` |
| `/trends` | `src/app/trends/page.tsx:68` | yes - three branches at `:89`, `:91`, `:93` |
| `/journal` | `src/app/journal/page.tsx:58` | **no - the result is not even bound** |
| `/slicer` | `src/app/slicer/page.tsx:65` | **no - bound, then discarded on every outcome but one** |

**`/journal` is total silence.** The line is `await
journalStore.migrateGuestJournalEntries(scope);` - no assignment, so a person
whose entries were copied, failed to copy, or landed only in this browser sees
exactly the same page in all three cases. This is a MED bug already filed
(entered 2026-08-10 by PR #179), kept out of v0.28 on purpose, and it has been
open since.

**`/slicer` is the same silence, and it is NEW to this pass - nothing had filed
it.** `src/app/slicer/page.tsx:65` does bind the result, but the next line is
`if (cancelled || result.status !== "migrated" || result.migratedCount === 0) {
return; }`, so `error` and `migrated-locally` change no state at all. The
comment above it says so outright, at `:59-60`:

> `// quiet outcomes (skipped / already-migrated / error / migrated-nothing)`
> `// change no state at all, matching how /journal stays silent.`

That is the whole reason this is a milestone and not a bug patch: **the second
silent surface was written by copying the first**, and the copying is recorded
in a comment as though `/journal`'s silence were the convention rather than an
unfixed defect.

**The three speaking surfaces say it three times, in hand-written copies.**
`/trends:84` says of its own code, `// The "migrated-locally" branch mirrors
/now's exactly (v0.28,` - and `:81` says the same of the error branch. Two of
the three read their sentences from `src/lib/focus-session-copy.ts:33/41/51`;
the third (`planner-session.ts`) inlines four string literals. There is no
shared unit anywhere: the mapping from `GuestMigrationResult` to `AsyncStatus`
exists three times and is absent twice.

**Nothing in the quality gate holds a surface to reporting what it ran.**
`grep -rn 'migrateGuest' src/app/__tests__ src/__tests__` finds no guard over
the call sites, which is precisely why the silence could propagate by imitation.
`status-message-guard` is not that guard and does not claim to be: its corpus
is glob-discovered `page.tsx` files and it only forbids an inline `role="alert"`.
A page that renders *nothing at all* satisfies it perfectly.

### 1b. The asymmetry that makes this checkable rather than cosmetic

`migrated-locally` is not producible everywhere, and that is a fact about the
stores, not a style choice. It is minted only by `guestMigrationLandedLocally`,
whose nine call sites are all in three files
(`grep -rn 'guestMigrationLandedLocally(' src/lib`): `checkin-store.ts:213/249/271`,
`focus-session-store.ts:153/183/204`, `journal-store.ts:146/176/198`.
`slicer.ts` and `planner-state.ts` never call it - both pin their marker's
backend segment to a literal `"local"` and have no Firestore twin at all.

`docs/design/MIGRATION_DESTINATION.md` D2 states the rule verbatim:

> NOT mapped: the plain `local` backend. There the browser is the destination
> by configuration; "will be copied to your account" would promise a cloud
> that does not exist.

So `/journal` needs three sentences and `/slicer` needs **two**, and a design
that gives `/slicer` a "will be copied to your account next time" line would be
shipping a promise the code cannot keep. This is the same discriminator the
`/` planner sentence needed and did not get (see D6).

---

## 2. What v0.30 is

**One seam and two voices.** The mapping every surface re-implements becomes a
single named unit; the two silent surfaces get their outcomes; and a guard
holds every `src/app` migration call site to routing its result through that
unit, so a sixth surface cannot be added silently the way the fifth was.

It is a capability increment (two surfaces start telling people what happened
to their data) with a code-health seam underneath it and a check on top, which
is the same shape as v0.21's status primitive and v0.22's route registry.

---

## 3. Decisions (each an overridable default)

### D1. The seam is a PURE FUNCTION, not a hook and not a component

`src/lib/migration-notice.ts`:

```ts
export type MigrationCopy = {
  ok: string;
  /** Omitted by a store with no cloud twin - see D3. */
  local?: string;
  error: string;
};

export function migrationNotice(
  result: GuestMigrationResult,
  copy: MigrationCopy,
): AsyncStatus;
```

Returns `{ type: "idle" }` for `skipped`, `already-migrated`, and for any
`migrated` / `migrated-locally` whose `migratedCount` is 0 - the existing
"calm and one-directional" rule (`GUEST_DATA_MIGRATION.md` D5), preserved
exactly, not re-decided here.

**Why a pure function.** The three existing copies differ *only* in their
strings, so a function taking the strings collapses all three with no behaviour
change, and it is drivable by a test without rendering a page - which is what
lets D5's guard observe real execution instead of reading source text
(the L-055 shape: the reason this is currently unguardable is that it is not
addressable, not that the property is hard).

**Alternative rejected: a `useMigrationNotice` hook.** Two of the five call
sites are not in components at all (`planner-session.ts` is a plain async
function that `/` awaits), so a hook would fit three sites and force the other
two to keep their own copy - which is the defect, not the fix.

### D2. The copy stays PER SURFACE; only the mapping is shared

Each surface passes its own `MigrationCopy`. `/now` and `/trends` keep reading
`FOCUS_SESSION_COPY`; `/journal` and `/slicer` get their own records beside
their stores; `planner-session.ts`'s four inline literals move into one named
record in the same style.

**Alternative rejected: one global sentence set.** The sentences name what
moved - "Your earlier focus sessions are here now." - and a generic "Your data
is here now." would be a real regression in the calm specificity this product
is built on. Sharing the *decision* is the win; sharing the *words* is a loss.

### D3. What the two silent surfaces say

Standing defaults, in the v0.21 status vocabulary (`StatusMessage`, tone
derived not hand-spelled) and under the v0.28 honesty rule:

**`/journal` - three, because `journal-store.ts` has a Firestore twin:**

- `ok`: **"Your earlier journal entries are here now."**
- `local` (`notice`): **"Your earlier journal entries are safe in this browser.
  They will be copied to your account next time it can be reached."**
- `error`: **"Could not bring your earlier journal entries across."**

**`/slicer` - TWO, and the omission is the decision:**

- `ok`: **"Your earlier sliced tasks are here now."**
- `error`: **"Could not bring your earlier sliced tasks across."**
- **No `local` sentence.** `slicer.ts` never calls
  `guestMigrationLandedLocally`, so `migrated-locally` cannot be produced there;
  a sentence for it would be dead copy that also promises a cloud this store
  does not have (section 1b, `MIGRATION_DESTINATION.md` D2).

`MigrationCopy.local` is therefore **optional**, and `migrationNotice` must
return `{ type: "idle" }` - never an invented sentence - when a
`migrated-locally` result arrives with no `local` string. That combination is
unreachable in the shipped tree today and is asserted anyway, because it is the
only thing standing between "this store has no cloud" and a false promise if a
sixth surface gets it wrong.

### D4. Placement: the same place on all four pages

The migration line renders directly below the page's intro paragraph and above
the surface's own content, matching `/now` and `/trends` today. On `/journal`
that puts it above the editor; on `/slicer` above the task input.

This answers the open question the MED bug named ("`/journal` has no existing
status surface, so it needs a placement decision"). The default is chosen for a
reason a reader can check: four surfaces already report migrations, and putting
the fifth and sixth anywhere else means a person who signs in and visits two
pages finds the same sentence in two different places.

Both go through `StatusMessage` with a `data-testid`, so the branches stay
distinguishable in assertions (its D1 test hook, already used by `/now` and
`/trends`).

### D5. The guard, and what it may NOT be on its own

`src/app/__tests__/migration-voice-guard.test.ts`.

- **Source A:** every `migrateGuest*` await in the shipped `src/app` tree,
  glob-discovered (never hand-listed, so a sixth surface is judged the moment
  it exists).
- **Source B:** `src/lib/migration-notice.ts`, called directly so the mapping
  is asserted rather than assumed.

It fails when a discovered call site's result does not reach `migrationNotice`.

**A call-site scan is a token match over source files, which a comment can
satisfy, so it ships PAIRED with behaviour tests that RUN the seam** - the
same pairing `storage-key-census` ships with, and for the same reason (L-033).
The negative control that matters is shaped to satisfy the cheap clause while
breaking the behaviour: keep the `migrationNotice` call and drop its return
value on the floor, exactly as `/journal` does today. The scan must stay green
and the behaviour test must redden; if both redden, the scan was never the
binding half and the milestone says so in the PR body.

The scan must also carry **blindness anchors**: two named call sites in two
different route directories, asserted by name, so narrowing the walker reddens
the anchor assertion instead of passing on a shorter list.

### D6. The `/` planner sentence stays CUT, and this milestone does NOT decide it

v0.28's D3 prescribed a second sentence for `/` - "Today's plan is safe in this
browser. It will be copied to your account next time it can be reached." - which
PR #179 cut rather than faked, because `migrateGuestPlannerState` pins its
marker to the `local` backend and D2 excludes that backend on purpose. The open
item's clearing condition is quoted here rather than summarised, because
summarising it is how these get lost:

> **Clears when** either (a) the owner answers whether `/`'s planner sentence
> should distinguish a cloud-backed app from a local-only one - if yes, the
> increment is a `cloudBacked` discriminator on `hydratePlannerSession` plus
> the D3 sentence, and it is small; or (b) a run records that the planner's
> "to your account" claim is about the account SCOPE rather than a cloud
> destination, and deletes the D3 bullet as a mis-reading.

Neither has happened, so **v0.30 leaves it exactly where it is.** What v0.30
changes is the cost of (a): once D1's seam exists and `MigrationCopy.local` is
optional, the discriminator is one optional string at one call site rather than
a fourth hand-written branch. The item stays open, with its clearing condition
unchanged. **This is a decision for the owner, and the analyst is not making
it.**

### D7. Two PRs, and the ordering the guard forces

**PR1 - the seam, behaviour-preserving.** `src/lib/migration-notice.ts` plus
its unit suite; `/now`, `/trends` and `planner-session.ts` rewired through it;
`planner-session.ts`'s inline strings lifted into a named record. **No page
changes what it renders.** This is a refactor increment and takes the stricter
bar: the existing suites for those three surfaces pass **unchanged**, and if
one had to change, the refactor changed behaviour and the PR says so or undoes
it.

**PR2 - the two voices, the guard, and the close.** `/journal` and `/slicer`
gain their `MigrationCopy` records and their `StatusMessage` lines; the guard
lands; the milestone closes.

**Why the guard cannot be in PR1:** it discovers its corpus by scanning the
disk, and on PR1's tree two call sites still drop their result, so it would be
red on the PR that introduces it. The guard lands in the commit that makes the
tree satisfy it - and, for the same filesystem-reading reason, **the roadmap's
guard-count sentence moves to Twenty-five with `migration-voice-guard` named,
AND `"twenty-five": 25` is added to `NUMBER_WORDS` in
`roadmap-guard-count.test.ts` (whose map ends at `"twenty-four": 24`), in that
same PR2 commit.** Both belong to the commit that adds the file, because that
guard reads the filesystem and not this plan. This is the clause v0.22's
PR1/PR2 split got wrong and every milestone since has budgeted for.

### D8. Code health, measured on the final tree

`src/app/slicer/page.tsx` is **729 lines** at `4dad1c7` (`wc -l`) - the second
largest page file in the repo, under the 1000-line hard candidate line but not
by much. PR2 adds a status line to it, so the PR body states its before/after
count measured on the tree being pushed, and if a `MigrationCopy` record would
push it materially, that record goes in its own module beside `slicer.ts`
rather than inline. Same rule for `src/app/journal/page.tsx` (**213 lines**).

`src/lib/migration-notice.ts` is expected to be well under 100 lines; the three
sites it replaces are 6, 6 and 22 lines of branch respectively, so PR1 should
be roughly net-neutral in total lines and strictly negative in duplicated
decisions. The PR body states the real numbers rather than this estimate.

---

## 4. Why this and not the other candidates

Every reason below was **re-read at its source this pass and its stated
condition re-tested**, not repeated from the v0.29 definition - a conditional
reason goes false with nobody editing it, and a ranked list that restates
verdicts hardens into a permanent ban on whichever item's blocker expired
first.

- **Import / restore - NOT eligible, and the backlog said otherwise.** The
  backlog item filed by PR #184 offered it as a candidate "whose section-5
  reopen condition the exporter now satisfies". Read verbatim,
  `WORKSPACE_EXPORT.md` section 5 says the opposite: *"Deferred 2026-08-11;
  reopen when an owner asks for restore, or when a support question arrives
  that only restore answers - **not merely because the exporter exists**."*
  The reopen condition explicitly EXCLUDES the exact fact the backlog cited as
  satisfying it. No owner has asked and no support question exists, so it stays
  deferred; the backlog line is corrected in the same edit as this definition.
- **Widening `status-message-guard` to components - real, but it is a
  RE-DECISION and needs its own increment.** PR #184 proved the panel is
  unguarded by that suite (it spelled `role="alert"` inline and the guard came
  back green, 4 passed), and that is true. But the guard's own header declares
  the exclusion deliberate: *"`role="alert"` stays legal inside
  `src/app/components/`, where `reminder-settings.tsx`'s field-level validation
  lives (out of scope by D5, and out of this scan by construction)."* A live
  instance sits at `reminder-settings.tsx:253`. So widening is not a bug fix;
  it reverses a recorded decision and must re-answer each existing site. It
  stays a filed item with that framing added.
- **FCM push - still structurally console-gated.** Re-tested:
  `grep -rn 'vapid\|firebase/messaging\|getMessaging' src` returns nothing at
  all, and the only mentions in the repo are the roadmap's own deferral lines
  (`:2285`, `:2437`). A VAPID key is minted in the Firebase console, and
  console actions are USER-ONLY, so the condition is unchanged.
- **Paid value expansion - its reason is conditional, and the condition still
  holds.** "Deferred until entitlement automation ships": v0.5 still reads
  DEPRIORITIZED, entitlement flips are still manual in Firestore, and a static
  export still cannot receive a webhook.
- **A PR template - still real, still not a milestone.** Re-tested:
  `ls .github/` returns `dependabot.yml required-checks.json workflows/`, and
  `ls .github/PULL_REQUEST_TEMPLATE*` errors with "No such file or directory".
  One file of repo hygiene; it belongs in a DevSecOps slot, not a version.
- **Splitting `route-registry-guard.test.ts` - still flagged, still no
  capability.** Re-measured: `wc -l` says **1036**, over the 1000-line hard
  threshold, preflight C10 flagged it again on this run. It is a
  refactor-trigger increment with a stricter bar and no user-visible change,
  and it stays a standing candidate rather than a milestone.
- **`/focus`'s two controls for one value - still a UX decision for the
  owner.** Re-tested: the `sr-only` wrapper is still at `focus/page.tsx:106`
  with its `<select>` at `:108`, alongside the fifteen chips that have
  announced themselves with `aria-pressed` since PR #180. Which one to keep is
  an owner call, filed and left.
- **The theme key's three spellings** (filed by PR #182) - real, but it is a
  one-home hygiene rule on a single key, sized like the onboarding-key fix
  rather than like a milestone. Stays filed.

---

## 5. Explicitly not in scope

- **Making `migrated-locally` producible for the slicer or the planner.** That
  means giving those stores a Firestore twin, which is a sync milestone, not a
  copy one. **Reopen when** either store gains a `firestore-*.ts` module.
- **The `/` planner sentence.** See D6: owner-gated, unchanged by this
  milestone, and made cheaper by it.
- **Widening `status-message-guard`'s corpus.** Section 4 - a re-decision with
  pre-existing sites to answer, filed separately.
- **Announcing `skipped` and `already-migrated`.** The one-directional rule
  (`GUEST_DATA_MIGRATION.md` D5) stands: a person who never used the app signed
  out should never be told about a migration. This milestone preserves that
  behaviour byte for byte and does not re-open it.

---

## 6. Owner overrides

*(Empty. Every D above ships on its stated default unless something is written
here. The three most worth a glance: D3's two sentence-sets and the deliberate
omission of a `local` line for `/slicer`, D4's placement, and D6's decision to
leave the `/` planner sentence to you.)*
