# v0.22 - One route vocabulary: every shipped surface is reachable, and nothing internal is in the front door

Status: DEFINED 2026-08-07 (product pass). Not started.

Every decision below is an **overridable default**: silence ships it, one word
from the user flips it. This document is the product analyst's proposal, not a
decision already taken. Section 6 records anything the user actually says.

Companion to `docs/ROADMAP.md`'s `### v0.22` section, which carries the
done-when. This file carries the evidence and the reasoning.

---

## 1. Premise, verified at source

Every claim in this section was read out of the working tree at
`43fa2da` (main, 2026-08-07), not inherited from a changelog or a previous
design doc. Line numbers are from that commit.

**The app ships 13 routes.** `find src/app -name page.tsx` returns 13 files:
`/`, `/ambient`, `/breathe`, `/challenges`, `/execute`, `/focus`, `/journal`,
`/monetization`, `/now`, `/pricing`, `/review`, `/slicer`, `/trends`.

**Four independent hardcoded lists decide where a person can go, and no test
compares any of them to the routes that exist:**

1. `src/app/components/site-nav.tsx:12-25`, `NAV_LINKS`: 12 entries, rendered
   into the primary `<nav aria-label="Primary">` on every page via
   `layout.tsx:68`.
2. `src/app/components/keyboard-help.tsx:16-23`, `GO_TO_TARGETS`: 6 chords
   (`g d` `/`, `g f` `/focus`, `g e` `/execute`, `g r` `/review`, `g t`
   `/trends`, `g j` `/journal`), the table that `router.push` actually reads at
   line 143.
3. `src/app/components/keyboard-help.tsx:36-55`, `SHORTCUT_ROWS`: the rows the
   help dialog *displays*, six of which restate list 2 in prose ("Go to
   Dashboard", "Go to Focus", ...). The file's own comment at line 15 says
   "Keep this table honest when shortcuts change", which is a comment doing a
   test's job: nothing fails if the dialog and the chord table disagree.
4. `src/app/page.tsx:346,358,369,377`, the dashboard action rail, which links
   `/focus`, `/execute`, `/review` and `/now`.

**Two concrete defects fall out of that, both visible to a first-time
visitor:**

- **`/now` is in no navigation surface.** It is absent from `NAV_LINKS` and
  from `GO_TO_TARGETS`. It is reachable, so this is not an unreachable-surface
  claim: `src/app/page.tsx:377` puts it in the dashboard rail as "One thing
  now". But the calm single-task timer that v0.12 built a whole `/trends` card
  around ("Focus sessions this week", PR #109) exists in the front door
  nowhere, and a person who is not on the dashboard cannot get to it in one
  move.
- **`/monetization` is a peer of Journal and Breathe in the primary nav**
  (`site-nav.tsx:24`, label "Monetization"). The page is an internal analytics
  view, by its own copy: `src/app/monetization/page.tsx:45` reads "This local
  analytics view shows pricing intent and CTA activity so you can validate
  monetization UX before backend analytics is wired." The "you" there is the
  developer. A first-time visitor to an ADHD coaching app meets a nav item
  named after the business model, one slot after Pricing.

**What is NOT a defect, checked rather than assumed:**

- `/ambient`, `/breathe`, `/challenges` and `/slicer` are all in the nav and
  all real user surfaces. No route in `NAV_LINKS` is missing a page file.
- `SwipeStepCard`'s `previousHref` / `nextHref` (`focus/page.tsx:49`,
  `execute/page.tsx:60,62`) are a fifth place routes are written down, and they
  are deliberately out of scope. They encode the daily task SEQUENCE (focus,
  then execute, then review), which is a different concept from "where can I
  go"; see section 5.

---

## 2. What v0.22 is

The same move v0.21 made for status messages, applied to routes: **one
vocabulary, one source, and a guard that reads the real filesystem instead of
trusting prose.**

A single route registry becomes the one place the app writes down what a route
is: its path, the word a person sees, whether it belongs in the front door,
and which keyboard chord reaches it. `site-nav.tsx` and `keyboard-help.tsx`
both read that registry instead of holding their own copies, and a new guard
suite fails when a shipped page is missing from it, when the registry names a
page that does not exist, or when either surface renders something the
registry did not say.

Shipping it also fixes the two defects above, because with one list they stop
being editorial oversights and become one-field decisions.

This is a frontend/UX milestone under the user's 2026-07-19 direction: what it
changes for a person is which doors they can see.

---

## 3. Decisions (every one an overridable default)

### D1. The registry lives in `src/lib/routes.ts`
Pure data plus small helpers, no React import, beside the `route-path.ts`
helper that v0.14 PR1 extracted for exactly this class of problem.
*Alternative considered:* keep it inside `site-nav.tsx` and have the keyboard
dialog import from a component module. Rejected because `src/lib` is where
this repo puts pure, directly testable modules, and a data import from a
`"use client"` component is the shape that makes a registry quietly grow React
concerns.

### D2. An entry carries five fields and no more
`path`, `label`, `inPrimaryNav`, `goToKey?`, `audience: "visitor" | "internal"`.
*Alternative considered:* icons, groups, and per-route descriptions. Rejected:
v0.22 does not redesign the nav (section 5), and fields nothing reads are the
defect class this repo already carries as a LOW bug (`use-monetization.ts`).

### D3. `/monetization` leaves the primary nav, and nothing else about it changes
It is marked `audience: "internal"`, `inPrimaryNav: false`. The route stays
live at its URL, the page file is untouched, and the existing "View analytics"
link inside the dashboard's collapsed `<details>Workspace insights</details>`
disclosure (`page.tsx:709,733`) stays exactly where it is, so the person who
wants the numbers still has a path to them.
*Alternatives considered:* (a) delete the page, rejected because it destroys a
working tool to solve a placement problem; (b) gate it behind sign-in,
rejected because v0.14 settled who may reach what and this milestone does not
reopen it; (c) leave it in the nav, which is the flip if the user disagrees,
and costs one boolean.

### D4. `/now` joins the primary nav, labelled "Now"
Positioned directly after "Dashboard", because it is the one route that is
useful with no plan, no check-in and no account.
*On the label:* the dashboard rail calls it "One thing now"
(`page.tsx:375`), but all 12 existing nav labels are single words, so "Now"
matches the vocabulary already on screen. Flipping to "One thing now" is a
string change.

### D5. `/now` gets the `g n` chord
Derived from its registry entry rather than added to a second table.
*Alternative considered:* no new chord, in which case the entry simply carries
no `goToKey` and the dialog shows one fewer row. This is the smallest decision
in the milestone.

### D6. The help dialog's "Go to X" rows are generated, not restated
The six navigation rows in `SHORTCUT_ROWS` are built from the registry entries
that carry a `goToKey`, using the registry's own label, so the dialog cannot
advertise a chord that does not work or hide one that does. The five
non-navigation rows (`?`, `Esc`, arrow keys, `Tab`, `Enter`) stay hand
authored: they describe behavior that is not a route, and inventing registry
entries for them would be the same mistake as D2's extra fields.

### D7. The guard reads the filesystem and the rendered DOM, never a source grep
`src/app/__tests__/route-registry-guard.test.ts` glob-discovers every
`src/app/**/page.tsx` with a zero-match hard failure, a floor of at least 13
discovered routes, and two named anchors (`/` and `/monetization`) so a
blinded discovery step fails loudly instead of reporting a clean sweep of
nothing (L-031's shape, as used by `status-message-guard` and
`workflow-secret-usage`). Every behavioral clause asserts on rendered output or
an imported value, never on the presence of a string in a file, because an
existence search is satisfied by a comment (L-033).

### D8. Two PRs, split so PR1 is decision-independent where it can be
- **PR1:** `src/lib/routes.ts`, `site-nav.tsx` reading it, the guard suite, the
  D3/D4 reachability changes, and the roadmap's guard-count sentence taken from
  **Fourteen to Fifteen** naming `route-registry-guard`. No version bump (the
  milestone-status guard makes a bump-before-DONE combination red, which v0.14
  PR1 proved the hard way).
- **PR2:** `keyboard-help.tsx` deriving both its chord table and its dialog
  rows (D5, D6), then `package.json` to `0.22.0`, both `package-lock.json`
  copies, and the `### v0.22` heading flipped to DONE, all in the same commit.

**Corrected while implementing PR1.** This decision originally put the
guard-count sentence in PR2, which was wrong and would have made PR1 red:
`src/__tests__/roadmap-guard-count.test.ts` discovers guard suites by reading
`.test.ts` files on disk under `src/__tests__` and `src/app/__tests__`, so the
moment `route-registry-guard.test.ts` exists the roadmap's number word and its
list of names disagree with the filesystem. Two of that suite's four tests go
red on the commit that adds the guard, not on the commit that bumps the word.
The general rule this is an instance of: an obligation enforced by a
disk-scanning guard belongs to whichever PR changes the disk, and cannot be
scheduled independently of it. Nothing else about the split moved; PR2 still
owns every version-bump artifact, which is the part the milestone-status guard
genuinely forces to travel together.

---

## 4. Done-when, each clause checkable by CI rather than by opinion

The authoritative copy of this list lives in `docs/ROADMAP.md`'s `### v0.22`
section. Restating it here in full would create exactly the two-copies drift
this milestone exists to remove, so this section names the shape and defers.

Every clause is either a test that fails without the change or a pinned gate
command, and none of them is an existence grep. The gate commands come from
`.github/workflows/ci.yml` (Node 24) and are run as pinned, not from whatever
the local shell resolves.

---

## 5. Explicitly NOT in scope, each with its trail

- **Nav grouping, icons, a mobile drawer, or any visual redesign.** The flat
  12-item nav is a real product question in an app whose product rules are
  about calm and low choice load, and D3 plus D4 leave it at 12. But a visual
  redesign mixed into a data-layer extraction produces a diff nobody can
  review, and the registry is the thing that makes a later grouping cheap
  (a `group` field, one place). Filed as a follow-up question rather than
  smuggled in.
- **`SwipeStepCard`'s `previousHref`/`nextHref`.** They encode the daily
  sequence, not the navigation vocabulary. Folding a sequence into a flat
  registry would invent a concept the product does not have. Recorded here so
  the next reader does not file it as drift the milestone missed.
- **Route-level auth or gating changes.** v0.14 settled who may reach the app
  and `subscription-guard.tsx` already owns the one exemption
  (`GATE_EXEMPT_ROUTES`). If the registry ever grows an `exempt` field, that is
  its own increment with its own decision.
- **The silent-migration product question** filed by PR #153 (a cloud write
  that fails, falls back to local, and reports success). Still open, still
  needs a product decision about whether a successful-but-local-only copy
  deserves any notice at all. It is not a routing question and does not ride
  along.
- **Workspace cloud sync**: unchanged trail. It would add a third Firestore
  rules block while the v0.9 `journal` and v0.12 `focusSessions` blocks both
  remain unpublished in the console (USER-ONLY), so the already-shipped sync
  features still fall back to localStorage in production. Deepening a pending
  user-gated obligation is still the wrong product move.
- **FCM push**: still multiple USER-ONLY console gates, re-checked at each of
  the last four definitions and unchanged.
- **The D7 second measurement divergence** (Firebase env in the measured
  build): a supply-chain decision awaiting the user.
- **Promoting the `lighthouse` context to required**: keeps its own dated
  clearing condition in the backlog.
- **`/journal/` and `/trends/` joining the Web Vitals gate**: v0.20's recorded
  cost reasoning stands.
- **D5's field-level and widget-internal message surfaces** from v0.21
  (`reminder-settings.tsx`'s six per-field hints being the largest): a later
  slice if the status vocabulary earns it.

---

## 6. User decisions recorded by this document

None yet. Every D above ships on its default unless the user objects; this
section gains a dated block if and when the user weighs in, matching the
convention `docs/design/PERF_PASS.md` section 2 and
`docs/design/STATUS_VOCABULARY.md` section 6 use.
