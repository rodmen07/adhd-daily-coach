# v0.26 - The last row: three actions stop costing a row of their own

Status: **SHIPPED 2026-08-08** (PR1 merged as PR #172, PR2 the completion PR
the same day). `package.json` reads `0.26.0`. Measured shipped figures, in
chromium against the real export: phones 137.9 -> 121.9 (PR1) -> 95.2 px
(PR2, two rows below the 56rem cap), desktop 67.0 -> 55.2 px (PR1, one row,
unchanged by PR2). One phrase of section 3 did not survive implementation and
is corrected in place with the superseded text quoted (D1's "two-row header at
every width"); every other decision shipped on its default.

Design authority: this document. Every decision in section 3 is an
**overridable default** - one word from the product owner flips any of them.
Section 6 is empty on purpose and is where a user decision gets recorded.

Every premise in section 1 was measured in **chromium against the real static
export** at tree `1b7d92e` (the commit v0.25 PR2 merged as), not read out of
the source and not inherited from the backlog entries that seeded this
milestone. The measurement commands are named in section 1's preamble, and one
inherited claim did not survive them - section 1d.

---

## 0. Where this sits in the arc, and why it is not a fifth nav milestone

v0.22 made one registry decide which doors exist. v0.23 asked whether a person
can get through them and collapsed the header from 264 px to 138 px. v0.24
asked what the doors mean. v0.25 asked whether anything outside the page says
which room you are in, and closed the nav arc.

v0.26 is **not** nav. It touches no route, no registry field, no chord, no
panel and no title. It is the one strip of the header that all three of those
milestones explicitly refused to touch, each recording the same reason in the
same words: the sync/help/theme cluster is *a separate surface with its own
tests and its own before/after obligation, and mixing it in would make the
header measurement unattributable - a ceiling that moved for two reasons proves
neither.*

That reason is not an objection to the work. It is a description of what the
work needs: its own milestone, its own measurement, its own ceiling. This
document gives it those three things.

The item was filed by PR #159 with a clearing condition offering two branches:
*either an increment restructures the cluster with a before/after header
measurement at the same three viewports, or a note records that 138 px is good
enough and the ceiling stays where v0.23 set it.* Section 1e explains why the
second branch is not defensible on the numbers measured below - and it is worth
saying plainly that the second branch was a live option until those numbers
came in.

---

## 1. Premise, measured rather than inherited

Every figure below comes from one procedure, run 2026-08-08 on branch
`autodev/v0.26-definition` at `1b7d92e`:

```
npm run build                          # the real static export
E2E_BASE_PATH=/adhd-daily-coach node e2e/serve.mjs &
node <scratch>/coach-measure-header.mjs # chromium, four viewports
node <scratch>/coach-measure-cluster.mjs
```

The scratch scripts are the same shape as `e2e/nav-shape.spec.ts`: launch
chromium, load `/` through `e2e/serve.mjs` at the production basePath, dismiss
the first-run overlay with **Quick start now** exactly as `openDashboard()`
does (an overlay is its own layout, and measuring the header underneath one
measures a state a returning reader never sees), then read
`getBoundingClientRect()` off the live nodes. They live outside the repo
because a product increment ships documents, not test files; the same
measurement becomes a committed assertion in PR1 and PR2, which is what
section 4 requires.

### 1a. The header is 137.9 px on every phone width, and it is three rows

| viewport | `.site-nav-shell` height | rows |
| --- | --- | --- |
| 375x667 | **137.9 px** (20.7% of the viewport) | 3 |
| 412x823 | **137.9 px** (16.8%) | 3 |
| 360x740 | **137.9 px** (18.6%) | 3 |
| 1280x720 | **67.0 px** (9.3%) | 1 |

The three phone widths are byte-identical because nothing in the header is
width-dependent below the `56rem` `.site-nav-inner` cap: the same three rows
wrap the same way at 360 as at 412.

The 137.9 reconciles exactly, which is what makes it attributable:

```
 10.0  .site-nav-inner padding-top
 18.7  .site-nav-title            (top 10.0)
 10.0  .site-nav-inner gap
 34.2  .site-nav-links            (top 38.7)  <- one row, one top coordinate
  8.0  .site-nav-actions gap
 46.0  the sync/help/theme cluster (top 80.9)
 10.0  .site-nav-inner padding-bottom
  1.0  border-bottom
------
137.9
```

**The cluster's row costs 54.0 px** - its own 46.0 plus the 8.0 px gap that
exists only because it is there. That is **39.2% of the header**, spent on
three controls.

### 1b. The tallest thing in the header is one control, and it is not the nav

`.site-nav-actions`' last child (`flex items-center gap-3`) measures
**327.1 x 46.0**, and it decomposes into:

| control | element | measured |
| --- | --- | --- |
| `SyncStatusBadge` | `<div>` pill, "LOCAL WORKSPACE" | 129.5 x 25.0 |
| `KeyboardHelp` | `<button class="keyboard-help-trigger">`, "?" | 30.0 x 30.0 |
| `ThemeToggle` | `<div class="theme-toggle-shell">`, "Dark mode" | 143.6 x **46.0** |

The nav row - twelve routes' worth of front door - is 34.2 px. The theme
toggle is 46.0 px, because `.secondary-button` is `padding: 10px 16px` around a
full text label. **One control, at 46.0 px, sets the height of the row and
therefore of the header.**

`KeyboardHelp` is the counter-example that makes the fix cheap: it is already a
30 x 30 circular control in this same cluster, with an accessible name and no
visible text. The compact vocabulary this milestone needs is already in
`globals.css` at `.keyboard-help-trigger` (lines 1100-1120), already shipped,
and already living beside the two controls that do not use it.

### 1c. The cluster cannot join the title row at any phone width

`.site-nav-inner` is `padding: 10px 16px`, so its content box is 32 px narrower
than the viewport. Against a 131.8 px title and the 10 px flex gap:

| viewport | content box | room beside the title | cluster needs |
| --- | --- | --- | --- |
| 375 | 343.0 | 201.2 | 327.1 |
| 412 | 380.0 | 238.2 | 327.1 |
| 360 | 328.0 | 186.2 | 327.1 |

So the cluster is between 89 and 141 px too wide to share the title row, and
**360 px is the binding width**: any shape that wants the title row must fit
the cluster into 186.2 px. That is the number PR2's layout has to hit, and it
is why this milestone is two PRs rather than one - the row cannot move until
the controls are narrow enough to receive it.

### 1d. FALSIFIED: "the cluster is not the binding constraint on desktop"

The backlog item filed by PR #159, confirmed live by PR #162, records:

> The desktop figure (67 px) shows the cluster is **NOT** the binding
> constraint there, so any future work here buys ~40 px on phones only.

Measured at 1280x720, that is wrong. The desktop header is one row whose
children measure title 18.7, `.site-nav-links` 34.2, cluster **46.0** - and the
shell is 67.0 = `10 + 46 + 10 + 1`. The cluster is not merely *a* constraint on
desktop, it is **the only thing above padding that sets the height**. The
desktop header is the theme toggle plus padding plus a border.

The claim is quoted above rather than edited away, per this repo's convention
of leaving superseded prose where it stood; the backlog item carries the same
correction, made in the increment that measured it. The practical consequence
is that this milestone has **two independent wins, not one**, and that PR1
delivers the desktop one before any layout changes at all.

### 1e. Why "138 px is good enough" is not the branch to take

The declining reason each nav milestone gave was about attribution, never about
value, and the value now has numbers on both sides:

- On phones the cluster's row is **39.2% of the header** (54.0 of 137.9 px),
  permanently, on every route, for three controls - one of which is already a
  30 px button.
- On desktop the cluster is **100% of the header above padding** (46.0 of the
  56.0 px of content-plus-border).
- The product is a calm daily coach used on a phone. 137.9 px of a 667 px
  viewport is 20.7% of the reading area subtracted before a word of content.

The alternative branch - write a note saying 138 px is fine - would also have
to explain why the desktop figure stays 67 px when 55 px is available for a CSS
change to one control. It is not defensible, so this document takes the first
branch. Recorded here so that choosing it is visible rather than assumed.

### 1f. The sync status is announced to nobody

Found while measuring, and it belongs to exactly this surface.
`src/app/components/sync-status-badge.tsx` renders all four of its states as a
plain `<div>` carrying a `title=` attribute and no role, no `aria-label` and no
live region. The visible text ("LOCAL WORKSPACE", "CLOUD SYNCED",
"SYNC OFF (LOCAL)", "SIGNED IN (LOCAL)", "GUEST (LOCAL)") is readable, so the
badge is not invisible to assistive technology today - but the **explanation**
(`title="All data saved on your device. Authenticate with Google to back up and
sync across devices"`) is carried only by `title`, which never appears on
touch, is not surfaced by every screen reader, and has no keyboard path at all.

This matters here and not somewhere else because D4 below proposes collapsing
the badge to its dot on phones. Collapsing a control whose only explanation is
a `title` would turn a weak accessible surface into no accessible surface, so
the fix and the collapse belong in the same PR. Filed as a LOW bug in the same
increment that wrote this document, so it survives whatever the owner does with
D4.

---

## 2. What v0.26 is

**One row of the header stops existing, and the control that sets its height
stops being the tallest thing in the app's chrome.** The sync, help and theme
controls become one compact strip on the title row; the nav row is untouched;
no route, registry field, chord, panel or title moves.

What it is not: a nav change, a taxonomy change, a new surface, a new
dependency, or a redesign of the theme-toggle *behaviour*. The two-step
light-mode confirmation is a deliberate calm-UX feature and it stays exactly as
it is (D3).

---

## 3. Decisions (every one an overridable default)

### D1. Two PRs, and each one moves a number by itself

**PR1 - the controls get compact.** Component and CSS only, no DOM
restructure. Predicted: phone 137.9 -> ~125.9 px, **desktop 67.0 -> ~55.2 px**.
The desktop win lands entirely here, because at 1280 the title, nav and cluster
already share one row and the row is as tall as its tallest child.

**PR2 - the row goes away.** The cluster leaves `.site-nav-actions` and joins
the title on one line; `.site-nav-inner` becomes a two-row header below the
56rem cap, and the one-row desktop is untouched. (This sentence read "a
two-row header at every width" until PR2 shipped. That phrasing contradicted
D5's own table - the 1280 ceiling stays 60 after PR2, and a two-row desktop
measures ~95 px - and done-when clauses 5 and 6 name only the three phone
widths, so the clauses governed and the prose is corrected rather than obeyed,
quoted per the standing convention.) Predicted: phone ~125.9 -> ~99.2 px;
measured 121.9 -> 95.2, the delta being this table's 34 px cluster estimate
against the 30 px PR1 shipped.

The split is not cosmetic. PR1's change cannot be attributed if it lands with a
layout change, which is the exact mistake v0.23 refused to make; and PR2's
layout cannot land first, because section 1c shows the cluster does not fit
beside the title until PR1 has shrunk it. **Dependency order, not sizing.**

Predicted arithmetic, stated now so a miss is visible rather than absorbed:

```
PR1 phone : 10 + 18.7 + 10 + 34.2 + 8 + 34 + 10 + 1 = 125.9
PR1 desktop: 10 + max(18.7, 34.2, 34)     + 10 + 1 =  55.2
PR2 phone : 10 + max(18.7, 34) + 10 + 34.2 + 10 + 1 =  99.2
```

### D2. Compact controls on the title row - NOT "move them into the More menu"

The rejected alternative is real and would be *larger*: v0.24 already turned
the "More" disclosure into a proper dismissable, grouped menu, so moving three
actions into it is a small edit and would take the phone header to ~83.9 px -
better than D1's ~99.2.

It is rejected because of what the sync badge is. This is a local-first product
whose paywall sells sync and backup; the badge is a **persistent state
indicator** telling a reader whether today's check-in is on their device or in
the cloud. A state indicator behind a menu is not an indicator. The other two
controls (help, theme) would survive the move fine, so the owner may reasonably
flip this for those two alone - that flip is D2a and costs roughly 12 px more
on phones.

Recorded rather than silently dropped, per the standing convention for declined
options.

### D3. `ThemeToggle` loses its visible label, keeps everything else

The glyph is already there: `.theme-toggle::before` renders `◐` in dark and
`◑` in light (globals.css:315-322), so the control already has a visual
identity that flips with the theme. Dropping the `"Dark mode"` / `"Light mode"`
text and sizing the button like `.keyboard-help-trigger` is a CSS change plus
one string.

Unchanged, and asserted unchanged: the `aria-label`
(`"Switch to light mode"` / `"Switch to dark mode"`), `aria-pressed`,
`aria-expanded`, and the whole two-step confirmation flow - including its
`Escape` handler and its `role="status"` explanation panel. The confirmation
today changes the BUTTON's text to `"Confirm light mode"`; with no visible
text, the confirmation's meaning must live entirely in the panel that already
renders below it, so PR1 owes one string change there and the existing
`src/app/components/__tests__/theme-toggle.test.tsx` assertions on that panel
must still pass **unchanged**. If one of them has to change, the refactor
changed behaviour and PR1 says so explicitly.

### D4. `SyncStatusBadge` keeps its word on desktop, collapses to its dot on phones

Below the `56rem` cap the badge renders its dot plus a visually hidden label;
above it, the word comes back. `sr-only` is already used in this codebase
(`src/app/focus/page.tsx:105`, `src/app/page.tsx:543`), so this needs no new
utility.

The accessible name is **identical at both widths** - that is the clause that
makes this safe, and section 4 asserts it rather than trusting it. The `title`
explanation stays for pointer users and, per section 1f, stops being the only
carrier: the sentence it holds moves into the visually hidden text.

Deliberately NOT a live region. `role="status"` here would announce the sync
state on every page load, which is noise on a product whose first rule is calm.

### D5. The ceilings ratchet in the same PR that moves the number

`e2e/nav-shape.spec.ts` carries `headerCeiling` 150 / 150 / 100. A restructure
that leaves them there stops the gate describing the shape it guards - the PR
#159 item says so, and it is right.

Each PR lowers its own ceilings to **its measured achievable figure plus ~9%**,
the same proportional slack v0.23 chose (138 measured, 150 ceiling, 8.7%). On
the predictions above that is:

| | 375 / 412 / 360 | 1280 |
| --- | --- | --- |
| today | 150 | 100 |
| after PR1 | 137 | 60 |
| after PR2 | 108 | 60 |

The numbers in the table are predictions. **The ceiling is set from the
measurement, not from this table**, and if the measurement disagrees with the
prediction the PR body says by how much and why.

### D6. No new guard suite, and therefore no count obligation - stated rather than discovered

`roadmap-guard-count.test.ts` discovers suites by listing `.test.ts` files on
disk under exactly `src/__tests__` and `src/app/__tests__` (`GUARD_DIRS`,
line 50), so a new file THERE goes red on the commit that adds the file, not on
a later prose commit. v0.25 D7 priced that lesson; this milestone does not have
to pay it.

Default: the unit assertions extend the **existing** component suites,
`src/app/components/__tests__/sync-status-badge.test.tsx` and
`.../theme-toggle.test.tsx`. That directory is `src/app/components/__tests__`,
which is **not** in `GUARD_DIRS`, so the roadmap's `**Twenty-one**` count word
and its names list do not move in either PR.

If the owner (or the implementation) prefers a new suite under one of the two
scanned directories instead, the PR that adds the file owes, in the same
commit: the count word `Twenty-one -> Twenty-two` and the new name in that
sentence's list. `NUMBER_WORDS` already carries `"twenty-two": 22` and the
claim regex is already `[\w-]+`, so - unlike v0.25 - **no parser change is
needed**. That is the whole difference, and it is why this is a one-line
obligation rather than a three-part one.

### D7. The browser proof extends `e2e/nav-shape.spec.ts` rather than adding a spec

The header's height is a measurement with no meaning in jsdom - that file's own
opening comment explains why - and it already measures exactly the right node
at exactly the right four viewports with the right vacuity and no-sideways-
scroll controls. Adding a second spec measuring the same shell would create two
places that must agree about the ceiling. `e2e/` is excluded from vitest, so
nothing there touches any count either way.

### D8. Nothing in the registry, the routes or the titles is touched

No `RouteEntry` field, no `ROUTES` edit, no `metadataForRoute` change, no
`layout.tsx` segment change. `route-title-contract`, `route-door-census`,
`route-registry-guard` and `e2e/route-identity.spec.ts` must all pass
**byte-for-byte unchanged** through both PRs; if one of them moves, this
milestone left its lane.

---

## 4. Done-when, each clause checkable by CI rather than by opinion

None of these is an existence grep, and none is satisfied by reading a file.

1. **PR1, the control shrinks:** in chromium against the real export, the
   cluster measures <= 36 px tall and <= 190 px wide at 360x740, and the theme
   control's own box is <= 36 px tall. (190 is section 1c's binding 186.2
   rounded up with the same slack rule; the width clause is what makes PR2
   possible and is asserted in PR1 so PR2 cannot discover it late.)
2. **PR1, the desktop header:** `.site-nav-shell` measures <= 60 px at
   1280x720, down from the 67.0 px this document records, and
   `e2e/nav-shape.spec.ts`'s 1280 `headerCeiling` is lowered to that number in
   the same commit (D5).
3. **PR1, nothing about the theme control's contract moved:** its accessible
   name is still exactly `Switch to light mode` / `Switch to dark mode`,
   asserted by an accessible-name query rather than by text content, and
   `src/app/components/__tests__/theme-toggle.test.tsx`'s confirmation-flow
   assertions pass unchanged - or the PR states which one changed and why.
4. **PR1's control:** revert only the compact sizing (the CSS rule and the
   dropped label), rebuild, rerun, and quote the named red - the cluster back
   at 46.0 px and the desktop shell back over the new ceiling. The
   perturbation is confirmed applied with a `git diff --numstat` plus a
   `grep -c` before the red is claimed.
5. **PR2, the phone header:** `.site-nav-shell` measures <= 108 px at 375x667,
   412x823 **and** 360x740, down from the 137.9 px recorded here, with the
   ceilings lowered in the same commit.
6. **PR2, the structural clause a font shrink cannot fake:** at all three phone
   widths the title and the actions cluster share **one** `top` coordinate, and
   `.site-nav-links`' children still share exactly one `top` of their own -
   two rows total, asserted as two distinct coordinates rather than as a pixel
   count. The existing no-sideways-scroll clause stays green at every viewport.
   (As shipped, the shared coordinate for the title/cluster pair is the
   vertical CENTER, not the literal `top`: `.site-nav-inner` centers its
   items, so an 18.7 px title beside a 30 px cluster sits 5.6 px lower by
   construction even on one row - tops literally cannot be equal there. The
   nav children keep the literal shared-`top` assertion, being same-height
   pills. Intent unchanged, coordinate corrected; stated here and in the PR
   body per clause 3's own "or the PR states which one changed and why" rule.)
7. **PR2's control:** restore the previous DOM nesting (cluster back inside
   `.site-nav-actions`), rebuild, rerun, quote the red naming the third row.
8. **The sync badge says the same thing at both widths:** its accessible name
   at a 375-wide render and at a 1280-wide render are equal and non-empty, and
   that name contains the explanation `title` carries today - asserted in
   jsdom by accessible name, so it fails if the collapse drops the text
   instead of hiding it.
9. **The gate:** the pinned CI job green on both PRs (`npm run lint`,
   `npm run typecheck`, `npm run build`, `npm audit --audit-level=high`,
   `npm run test:coverage`, Node 24 per `.github/workflows/ci.yml`), both
   required contexts `lint-and-build` and `lighthouse` pass, and `e2e` stays
   green. The Lighthouse gate holding is part of this clause: the header is
   above the fold on every route, so a layout change that regresses CLS is
   caught by the gate that already exists rather than by a new one.
10. **After PR2:** `package.json` reads `0.26.0` with both `package-lock.json`
    copies matching (`lockfile-version-parity`), the `### v0.26` heading reads
    DONE (`roadmap-milestone-status`), and the Current-state version sentence
    reads `0.26.0` (`roadmap-version-claim`) - all in the same commit.
11. **Every behavioural clause is proven by a control** whose perturbation is
    confirmed applied and whose named red line is quoted, with the
    implementation committed before the first perturbation.
12. **The lane held:** `route-title-contract`, `route-door-census`,
    `route-registry-guard` and `e2e/route-identity.spec.ts` are unchanged files
    and green in both PRs (D8).

---

## 5. Explicitly NOT in scope, each with its trail

- **Per-route `<meta name="description">` and Open Graph tags.** Thirteen
  sentences of editorial copy is an owner decision, and `metadataForRoute()` is
  exactly where they would land additively whenever it is taken. Declined by
  v0.25 D6 for the same reason; unchanged here. It remains the strongest
  candidate for v0.27 if the owner wants to supply or approve the copy.
- **Moving the actions into the "More" panel** - D2's rejected alternative,
  with its ~83.9 px prediction and its stated cost recorded there rather than
  dropped.
- **The two-Escape-owners interaction filed by PR #166.** Real and small, but
  it is about the nav disclosure and the keyboard dialog, which this milestone
  deliberately does not touch (D8). It survives PR2 unchanged because PR2 moves
  the cluster, not the disclosure.
- **The `src/app/**` behaviour-coverage finding (PR #158) and the rendered-DOM
  theme-guard gap (PR #165).** Both QA-stream items with their own cadence
  slot.
- **The surviving `background-color: --var` declaration filed by PR #165.** It
  is emitted from `agents/dev-agent/`, which roadmap work may never edit.
- **`navGroupOrder()`'s second global read filed by PR #164.** A watched seam,
  not a defect.
- **FCM push.** Console-gated; re-checked at this definition and unchanged.
- **The silent-migration product question filed by PR #153.** Its own decision,
  unrelated surface.
- **Promoting `e2e` to a required context.** A DevSecOps item with its own
  evidence bar. It is now eligible on that bar - v0.25 added real e2e
  assertions and this milestone adds more - but a dev milestone should not also
  be the increment that decides its own gate becomes required.

---

## 6. User decisions recorded by this document

*(empty - this is where an owner decision on D1-D8 gets written, with the date
and the flip it caused)*
