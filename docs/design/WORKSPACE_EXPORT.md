# v0.29 - The way out: what this browser holds, in a file you can keep

Design doc for the v0.29 milestone, written by the 2026-08-11 product pass on
`d0542c3` (the tree PR #180 left). Every decision below is an **overridable
default**: it is what the implementing PR will do unless the owner says
otherwise in section 6, which is deliberately empty until they do.

The milestone in one sentence: **a person can download everything this browser
holds for them, in one file, and the app says plainly what that file does and
does not contain.**

---

## 1. The finding, read at the source (not inherited)

Three facts, each read off the tree at `d0542c3` rather than off a changelog.

**(a) Thirteen surfaces write to `localStorage` through twelve key families,
and nothing reads them back out for the person.** `grep -rnE
"localStorage\.(getItem|setItem|removeItem)\(" src --include=*.ts
--include=*.tsx`, with `__tests__` filtered out, returns **34 call sites across
13 files**. Resolving each call to the constant it names - reading the
declaration, not the call - gives twelve families:

| Key (or prefix) | Declared at | Scoped per account? |
| --- | --- | --- |
| `calm-daily-coach` | `src/lib/planner-state.ts:31` | yes |
| `calm-daily-coach-checkins` | `src/lib/browser-checkins.ts:26` | yes |
| `calm-daily-coach-focus-sessions` | `src/lib/focus-session.ts:47` | yes |
| `calm-daily-coach-journal` | `src/lib/journal.ts:29` | yes |
| `calm-daily-coach-migrated-guest` | `src/lib/guest-migration.ts:90` | per plan |
| `calm-daily-coach:challenges` | `src/lib/challenges.ts:131` | no |
| `calm-daily-coach:onboarding` | `src/lib/onboarding.ts:72` | no |
| `calm-daily-coach:plan-interest` | `src/lib/monetization.ts:40` | no |
| `calm-daily-coach:monetization-events` | `src/lib/monetization.ts:41` | no |
| `calm-daily-coach:reminder-prefs:<scope>` | `src/lib/reminder-preferences.ts:16` | yes |
| `calm-daily-coach:theme` | `src/app/components/theme-toggle.tsx:6` | no |
| `focus-adhd-coach:slicer` | `src/lib/slicer.ts:185` | yes |

**(b) The absence was checked, not assumed.** Before asserting "there is no
export", `grep -rnE "createObjectURL|new Blob|download=" src` (tests excluded)
was run over the whole tree: it returns **exactly three lines, all in
`src/lib/reminder-ics.ts` (216, 217, 220)**, the calendar file the reminder
panel hands over. So the app already knows how to build a Blob, mint an object
URL and click an anchor for someone - it has just never done it with their own
data. v0.29 reuses that mechanism rather than inventing one.

**(c) The last row of the table is a second namespace nobody had written
down.** The Current-state bullet says the localStorage namespace "is still
`calm-daily-coach` and is frozen forever on purpose". `focus-adhd-coach:slicer`
is not in that namespace. `git log -S "focus-adhd-coach" -- src/lib/slicer.ts`
returns one commit, `a668563` ("Add ADHD Task Slicer feature..."), which
predates the rename commit `e239298` - so the key is a fossil of the app's
"Focus" era, frozen for the same reason every other key is frozen: renaming it
would orphan real people's slicer history. The roadmap sentence is corrected in
the same pass that ships this doc.

**Why (c) matters to (a):** any export that finds its stores by scanning for a
`calm-daily-coach` prefix would silently drop slicer history - the one route the
product names itself after. The one store a prefix rule loses is the one store
a person would most notice missing.

**(d) The honesty problem v0.28 already taught us.** For a signed-in person on
a Firebase-configured deployment, check-ins, journal entries and focus sessions
live in `users/{uid}/...` in Firestore, and the browser's copy is whatever the
local-first store last held. A file labelled "your data" that contains only the
browser's half would repeat exactly the defect v0.28 fixed on `/`: a true
sentence about one backend, rendered as if it were true about both.

---

## 2. What v0.29 is

One capability and one guard.

- **The capability:** a "Download a copy" control that writes one JSON file
  containing every store this browser holds for the person currently using it,
  with an envelope that names where the data came from.
- **The guard:** a census that fails CI when a module writes a `localStorage`
  key the export's manifest neither carries nor explicitly excludes with a
  reason - so the file cannot quietly go stale the next time a feature adds a
  store.

Nothing else. No import, no cloud fetch, no delete (see section 5).

---

## 3. Decisions (each an overridable default)

### D1. The manifest is DECLARED, not discovered by prefix

`src/lib/workspace-export.ts` carries a `STORE_MANIFEST`: one entry per key
family, each naming the key (or the scoped-key builder), the module that owns
it, a human label, and a `kind` (see D4).

**Alternative considered and rejected:** iterate `window.localStorage` at
runtime and take every key matching a prefix. It is fewer lines and it is
wrong twice - it drops `focus-adhd-coach:slicer` (finding (c)), and it has
nowhere to record that a key was *considered and excluded*. A declared list
makes every store a one-field decision, which is the same argument
`src/lib/routes.ts` records for `navSlot`: a declared field cannot be changed
by accident, a positional or pattern rule can.

### D2. The census guard, and what it may NOT be on its own

`src/__tests__/storage-key-census.test.ts` (the twenty-fourth guard suite)
reads two independent sources:

- **Source A:** `STORE_MANIFEST` plus an `EXCLUDED_KEYS` list whose entries each
  carry a `reason` string.
- **Source B:** every `localStorage.` call site in the shipped tree
  (`src/lib/**`, `src/app/**`, `__tests__` excluded), resolved to the constant
  or template it keys on.

It fails when source B holds a key family absent from source A. It sits in
`src/__tests__/` rather than `src/app/__tests__/` because its corpus is both
trees; `roadmap-guard-count` discovers either directory, so the placement does
not change what it counts.

**A census is a token match over source files, which is the defect wearing a
test's clothes** - it is satisfied by a comment. So it is NOT the whole
done-when. It ships paired with a **round-trip behaviour test** the search
cannot fake: seed a jsdom `localStorage` by calling each store's real public
write function (`saveSlicedTasks`, `saveJournalEntry`, ...), then assert
`collectWorkspaceExport()` returns each written value. The census proves the
manifest is COMPLETE; the round-trip proves it is CORRECT; neither alone is
evidence.

**Two blindness anchors**, in the `roadmap-guard-count` idiom: the guard names
`calm-daily-coach:challenges` (from `src/lib/`) and `calm-daily-coach:theme`
(from `src/app/components/`) as keys the scan must find, so an edit that blinds
the walker - narrowing a glob, dropping a directory - fails the suite instead of
emptying its input and passing.

### D3. Negative controls are perturbations of the CONSUMER, not of the shared source

The two sources above are already independent (one is hand-declared, one is
read off disk), so the controls are stated at the layer that can actually fail:

- **Control A (census fires):** add a module under `src/lib/` that writes a new
  `localStorage` key, leave `STORE_MANIFEST` untouched, and quote the census's
  red plus the `git diff` that produced it.
- **Control B (round-trip fires, census stays green):** flip the slicer row's
  `scoping` from `"scoped"` to `"global"`, so the collector reads
  `focus-adhd-coach:slicer` instead of the scoped key. The census stays green
  (8/8 - it checks that every call site resolves to a declared family, and the
  family is unchanged) while the round-trip reddens with 5 failures. That is
  the shape that proves the census alone was genuinely insufficient rather than
  merely redundant.

  **CORRECTED 2026-08-12 by the v0.29 milestone close, because the original
  clause was FALSIFIED when PR1 ran it.** It read: "delete one entry from
  `STORE_MANIFEST` **and** delete its call site's key constant so the census is
  satisfied - the cheap clause met, the behaviour broken. The round-trip must
  redden." Run verbatim on the slicer store, the census did NOT stay green: it
  reddened on `resolves every call site to a key family or a declared
  indirection`, because deleting the key constant makes `getScopedSlicerKey(scope)`
  unresolvable, and the census treats an UNRESOLVED call site as a failure
  rather than as a satisfied clause - an unresolved key is indistinguishable
  from an unexported store, which is the whole reason it is a failure. So the
  original control could not have separated the two suites: it reddened both.
  The paragraph below anticipated exactly this and said to correct the clause
  rather than report it met; this is that correction, kept in place rather than
  rewritten silently so the falsification stays legible.
- **Control C (blindness):** narrow the walker to one directory and confirm the
  anchor assertion reddens rather than the suite silently passing on a shorter
  list.

A control that edits `STORE_MANIFEST` and then watches the manifest-derived
assertion move is not a control; if a clause below reads that way when the
implementing PR gets to it, correct the clause rather than reporting it met.

### D4. What the file contains, and how a reader can tell what each part is

One envelope:

```
{
  "app": "ADHD Daily Coach",
  "formatVersion": 1,
  "exportedAt": "<ISO-8601>",
  "source": "this browser",
  "scope": "guest" | "<account id>",
  "stores": { "<manifest id>": { "label": ..., "kind": ..., "value": ... } }
}
```

`kind` is one of `"content"` (things the person wrote: journal entries, sliced
tasks, check-ins, focus sessions, today's plan), `"preference"` (theme,
reminder settings, onboarding answers) and `"record"` (migration markers,
plan-interest, monetization events - things the app wrote *about* the person).

**Everything in the manifest is included, `record` entries too.** The
alternative - quietly dropping the app's own instrumentation because it is "not
really your data" - is a small dishonesty of exactly the shape v0.28 removed,
and `kind` lets a reader draw the line themselves without the app drawing it
for them.

### D5. The sentence, in the v0.21 status vocabulary and the v0.28 honesty rule

The panel carries one standing sentence and one transient confirmation.

- Standing, always visible: **"Everything saved in this browser, in one file
  you can keep."**
- Standing, shown only when signed in on a Firebase-configured deployment:
  **"Entries that live only in your account are not in this file."**
- Transient, after the click: **"Copy downloaded."**, delivered through the
  shared `StatusMessage` primitive with `tone="notice"` (so politeness is
  derived, not hand-spelled), never a bare `alert()` and never an inline
  `role="alert"`.

  **CORRECTED 2026-08-12 by PR2, which implemented this and found the last
  clause false.** It read: "`status-message-guard` fails a `page.tsx` that
  spells one inline, and the new panel is held to the same bar by
  construction." The first half is true and the second does not follow from it:
  that guard's corpus is `PAGE_FILES`, glob-discovered `page.tsx` files under
  `src/app`, and D6 puts the panel in `src/app/components/`, which the guard
  never reads. Proven rather than argued - PR2 spelled `role="alert"` inline in
  the new component and `status-message-guard` came back **green, 5 passed**,
  so the panel is genuinely unguarded by it. Widening the corpus to components
  is NOT a free fix and was not smuggled into this milestone: `auth-message.tsx`
  and `reminder-settings.tsx` both spell `role="alert"` inline today, so the
  wider scan reddens on pre-existing code and needs its own increment with its
  own decision about each site (filed in the backlog). What holds the panel
  instead is its own suite, which asserts the confirmation's RENDERED
  `aria-live="polite"`, the absence of a `role`, and the `text-amber-700` tone
  class - a rendered-DOM check, which is the stronger of the two anyway.

The second sentence is the one this milestone exists to get right. It is a
condition on the rendered output, not a comment: the implementing PR asserts
both states.

### D6. The door is a panel on `/`, in its OWN file

The dashboard already hosts the settings-shaped surfaces - `ReminderSettingsPanel`
renders at `src/app/page.tsx:724` and the "Workspace insights" disclosure at
:783 - so a "Your data" panel below the reminder panel is where a person would
look, and it needs no fourteenth route (which would pull in the registry, the
nav, the chord table, the title contract, the description contract and the door
census for one button).

**It is a new component file, `src/app/components/workspace-export-panel.tsx`,
not inline JSX.** `src/app/page.tsx` measures **973 lines at `d0542c3`**
(`wc -l`), and the repo's hard candidate line is 1000; adding a panel inline
would cross it in the same commit that adds a feature, which is the one thing
the code-health bar names outright. The line count of every file touched goes
in the PR body, measured on the final tree.

Keyboard and motion, non-negotiable and asserted rather than intended: the
control is a real `<button>` inside the existing focus-ring system, reachable by
Tab, with no motion of its own (so there is nothing for `prefers-reduced-motion`
to suppress - if that stops being true, the reset in `globals.css` covers it and
the PR says so).

### D7. Filename and format

`adhd-daily-coach-workspace-YYYY-MM-DD.json`, `application/json`, built with the
same Blob → `URL.createObjectURL` → `anchor.download` → `revokeObjectURL`
sequence `src/lib/reminder-ics.ts:216-220` already uses. JSON rather than CSV or
Markdown: the stores are nested objects and arrays, one file must hold all
twelve, and JSON is the only format of the three that round-trips them without a
lossy flattening step nobody asked for.

`formatVersion: 1` exists so a future importer (section 5) has something to
branch on. It is a number in a file, not a promise.

### D8. Scope: the CURRENT scope only, never every scope in the browser

Six of the twelve families are keyed per account (`scopeKey`), so one browser
can hold a guest workspace and one or more signed-in workspaces side by side.
The export takes **only the scope the person is currently in**.

**Alternative rejected, with the reason stated plainly:** exporting every scope
present would hand whoever clicks the button the contents of every account that
has ever signed in on that browser - a shared laptop turns a convenience feature
into a disclosure. "Your workspace" means the one you are in.

### D9. Two PRs, and the obligation that is NOT schedulable

- **PR1 - the manifest and the file.** `src/lib/workspace-export.ts`,
  `src/__tests__/storage-key-census.test.ts`, the round-trip suite, and controls
  A/B/C. No UI.
- **PR2 - the door.** `workspace-export-panel.tsx`, its wiring on `/`, the two
  standing sentences and the transient one, an `e2e/` assertion in real chromium
  that the click produces a download whose parsed JSON carries the envelope keys
  and the expected store ids, then the milestone close (`package.json` to
  `0.29.0` with BOTH `package-lock.json` copies for `lockfile-version-parity`,
  the `### v0.29` heading flipped to DONE, and the Current-state version
  sentence).

**PR1 owes the guard-count prose, and PR2 must not be scheduled for it.**
`src/__tests__/roadmap-guard-count.test.ts` finds guard suites by
`readdirSync` over `src/__tests__` and `src/app/__tests__` (`discoverGuardSuites`,
lines 82-96 - it reads the filesystem, not this plan), so the roadmap's
**Twenty-three** → **Twenty-four** word and the new suite's name in that
sentence go red on the commit that ADDS `storage-key-census.test.ts`. Deferring
them to PR2 does not make PR1 smaller, it makes PR1 red.

**And PR1 owes one thing no previous milestone has:** that guard's
`NUMBER_WORDS` map ends at `"twenty-three": 23`, and an unknown word fails
loudly by design rather than coercing. So PR1 adds `"twenty-four": 24` to the
map in the same commit. This is the first milestone where the count word crosses
the end of that table; it is written here because it is invisible from the
roadmap sentence itself.

One more trap, from the same guard and already paid for twice (PR #174 and
PR #180): its names parser keeps every backticked token matching
`/^[a-z][a-z0-9-]*$/`, so **any lower-case hyphenated token backticked inside
that sentence becomes a phantom guard suite**. When PR1 writes the new clause,
it must not backtick `calm-daily-coach`, `focus-adhd-coach`, or any other
lower-case hyphenated word there. The suite name itself is backticked - that is
how it is counted.

---

## 4. Why this and not the other candidates

Each rejection re-reads the recorded reason and tests the condition that reason
actually names, rather than repeating the verdict.

- **Push notifications via FCM.** Recorded reason (v0.11, re-checked at the
  v0.17 definition 2026-07-26): "Needs a service worker plus console-side
  FCM/VAPID-key setup, so it carries multiple USER-ONLY gates before any code is
  exercisable." Re-tested 2026-08-11: the condition is structural, not
  conditional - a VAPID key is minted in the Firebase console, and console
  actions are on the standing USER-ONLY list. Still not agent-doable. Unchanged.
- **Paid value expansion (advanced narratives, cloud restore).** Recorded
  reason: "deferred until entitlement automation ships." That is a CONDITIONAL
  reason, so it was tested rather than repeated: v0.5 is still DEPRIORITIZED,
  entitlement flips are still manual in Firestore, and no webhook receiver
  exists because the app is a static export. The condition holds. Unchanged.
- **A PR template.** Recorded reason: "Repo hygiene, small, unscheduled."
  Re-tested: `.github/` holds `dependabot.yml`, `required-checks.json` and
  `workflows/` and no `PULL_REQUEST_TEMPLATE*`, so the item is still real - and
  still one file. It is backlog hygiene, not a milestone.
- **Splitting `route-registry-guard.test.ts` (1036 lines, preflight C10).** A
  behaviour-preserving refactor with a stricter bar and no new capability; it is
  a refactor-trigger increment, not a milestone, and it stays the standing
  candidate it has been since the v0.28 definition named it.
- **An empty-state pass.** Checked before proposing it, and it is already done:
  `CalmEmptyState` renders on `/trends` (:176), `/journal` (:181) and `/review`
  (:127). Nothing to build.
- **`/focus`'s two controls for one value** (the sr-only `<select>` beside the
  chip grid, filed by PR #180). Real, and it is a UX decision the owner should
  make rather than a milestone; it stays in the backlog where PR #180 filed it.

---

## 5. Explicitly not in scope

- **Import / restore.** Reading a file back in means merging into live stores
  that already hold data, which is a conflict-resolution design, not a button.
  `formatVersion: 1` is the hook for it. **Deferred 2026-08-11; reopen when an
  owner asks for restore, or when a support question arrives that only restore
  answers** - not merely because the exporter exists.
- **Exporting the cloud half.** Reading Firestore for the export would make the
  button an authenticated network call with its own failure vocabulary, and
  D5's second sentence is the honest interim. **Deferred 2026-08-11; reopen when
  the Firestore rules in `docs/FIRESTORE_RULES.md` are published in the console
  (USER-ONLY, still outstanding), because until then no real user's data is in
  Firestore at all.**
- **Deleting local data ("clear my workspace").** The sibling capability, and a
  destructive one; it needs its own confirmation design. Not in v0.29.
- **Renaming `focus-adhd-coach:slicer`.** Frozen forever, deliberately: a
  rename orphans real slicer history. The export is where the inconsistency
  stops being visible to a person, which is the only place it needed fixing.

---

## 6. Owner overrides

*(Empty. Every D above ships on its stated default unless something is written
here. The three most worth a glance: D4's decision to include `record` entries,
D5's two standing sentences, and D8's current-scope-only rule.)*
