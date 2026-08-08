# v0.24 - Nine peers in a smaller box: the "More" menu gets meaning, and gets out of the way

Status: **SHIPPED 2026-08-08** — PR1 (D2-D6 and D8) and PR2 (D7, the browser
dismissal clause and the `0.24.0` bump), both dev-role increments.
`package.json` reads `0.24.0`.

> **Reading section 1 after the milestone.** Every claim in it was true of the
> tree at `72b6f5a` and is quoted at that commit on purpose, per this system's
> convention of leaving superseded prose where it stood rather than editing
> history. The milestone falsifies all four of them BY DOING THE WORK, which is
> the intended outcome and not drift: `grep -rn 'navGroup' src/` is no longer
> empty, the `<h[1-6]|<ul|<li|role="group"|aria-labelledby` count in
> `site-nav.tsx` is no longer 0, no front-door route is chordless, and section
> 1c stopped being true in PR2 —
> `grep -cE 'addEventListener|useEffect' src/app/components/site-nav.tsx` was
> **0** through PR1 and is now non-zero, one `keydown` listener and one
> `pointerdown` listener, both on `document`.

Every decision below is an **overridable default**: silence ships it, one word
from the user flips it. This document is the product analyst's proposal, not a
decision already taken. Section 6 records anything the user actually says, and
is empty until then.

Companion to `docs/ROADMAP.md`'s `### v0.24` section, which carries the
done-when. This file carries the evidence and the reasoning.

---

## 1. Premise, verified at source rather than inherited

Every claim in this section was checked against the tree at `72b6f5a` (v0.23
PR2, the head of `main`) with a command, and the command is named beside it.
Two of the three claims came into this document from earlier backlog entries;
both were re-checked, and one of them turned out to be **understated**.

### 1a. v0.23 answered the SPACE question and left the MEANING question exactly where it was

The header went from 264 px to 138 px at 375x667 by moving nine of the twelve
primary-nav routes behind a native `<details>` disclosure. That is a real
answer to "does it fit". It is not an answer to "what are the categories",
and the flat-12 question filed by PR #155 is, if anything, sharper now: a
reader who opens "More" meets **nine undifferentiated items with no headings
at all**, where before they met twelve undifferentiated pills.

Verified, not assumed: `src/app/components/site-nav.tsx` renders the panel as
a bare `<div className="site-nav-more-panel">` holding nine `<Link>`s.
`grep -cE '<h[1-6]|<ul|<li|role="group"|aria-labelledby' src/app/components/site-nav.tsx`
returns **0**, so there is no heading, no list semantics and no labelled group
in that surface — for a sighted reader or for a screen reader.

`docs/design/NAV_SHAPE.md` section 5 named this deliberately out of scope for
v0.23 and named the field a later taxonomy would sit beside: `navGroup`.
`grep -rn 'navGroup' src/` returns nothing, so the field is a plan, not a
half-built thing to finish.

### 1b. FIVE front-door routes have no `g` chord, not four

The open backlog item filed by PR #160 says four routes still have no chord —
`/slicer`, `/ambient`, `/breathe`, `/challenges`. Re-read at the source rather
than repeated, the set is **five**: `/pricing` has no chord either.

```
$ grep -cE '^  \{ path: .*inPrimaryNav: true' src/lib/routes.ts   -> 12
$ grep -c  'goToKey: "' src/lib/routes.ts                          ->  7
```

The seven that have one are `/` (d), `/now` (n), `/focus` (f), `/execute` (e),
`/review` (r), `/trends` (t), `/journal` (j). The five that do not are
`/slicer`, `/ambient`, `/breathe`, `/challenges` and `/pricing`.

The reason the earlier entry says four is legible and worth writing down: it
was filed by the increment that closed the **orphan-route** bug, whose subject
was the six routes with no door outside the header. `/pricing` was never an
orphan — the paywall links to it — so it fell out of that increment's frame and
out of the sentence it left behind. The frame was right for that bug and wrong
as a census. An absence claim inherited from the increment that happened to
notice it is not a census, and this one was off by twenty percent.

The letters `s`, `a`, `b`, `c` and `p` are all unclaimed
(`goToRoutes()` yields exactly `d n f e r t j`), so no chord collides.

### 1c. The disclosure is a menu that cannot be dismissed

`NAV_SHAPE.md` D4 chose a native `<details>` over a `<button aria-expanded>`
popover and recorded both costs honestly before shipping: native `<details>`
closes on neither `Escape` nor an outside click. v0.23 PR2 added the one
behaviour that would otherwise have been a bug — the panel closes when a link
inside it is chosen, because client-side navigation does not remount `SiteNav`
and `<details>` keeps its open state in the DOM — and deliberately stopped
there.

That cost is now paid on every page by every reader rather than discussed in a
document, and it is the last interaction gap in the surface v0.23 built.
Verified: `grep -cE 'addEventListener|useEffect|onKeyDown|onBlur' src/app/components/site-nav.tsx`
returns **0**. The component has no document-level listener of any kind.

The pattern to copy already exists in this repo and is already tested:
`src/app/components/keyboard-help.tsx` closes its dialog on `Escape`
(line 133) and restores focus to the element that opened it via
`restoreFocusRef`. This is not new machinery, it is machinery this app already
ships one component away.

---

## 2. What v0.24 is

**The nine items behind "More" stop being a list and become four short ones,
the keyboard reaches all twelve front-door routes, and the disclosure behaves
like the menu it is.**

It is where v0.23 leads, in the same way v0.23 followed v0.22. v0.22 made one
registry decide WHICH doors exist. v0.23 asked whether a person can get
through them and made the header fit. v0.24 asks what the doors MEAN and
finishes the interaction v0.23 knowingly left half-built.

Three things, in two PRs, in a fixed order:

1. **Meaning.** `navGroup` joins `navSlot` in the registry; the "More" panel
   renders one labelled group per category; the keyboard dialog adopts the same
   categories, because it reads the same registry.
2. **Reach.** Every primary-nav route gets a `g` chord, so the keyboard covers
   the whole front door rather than the seven routes that happened to have one.
3. **Behaviour.** `Escape` and an outside click close the disclosure and return
   focus to its summary.

(1) and (2) are one PR because both are registry-field edits whose effect is
felt in the two surfaces derived from the registry. (3) is its own PR because
it is interaction code in one component with its own controls.

---

## 3. Decisions (every one an overridable default)

### D1. Two PRs, meaning before behaviour

**PR1 (the registry gains meaning):** `navGroup` on every primary-nav entry,
chords for the five routes without one, the grouped "More" panel, and the
grouped keyboard dialog.
**PR2 (the disclosure behaves like a menu):** `Escape`, outside click, focus
return, the E2E assertion, and the `0.24.0` bump.

The order is the design, as it was in v0.23, but for the opposite reason.
There, half 2 without half 1 was a regression; here neither half breaks the
other, and the order is about **attributable evidence**. PR1 changes what the
panel CONTAINS (nine flat links become four labelled groups); PR2 changes how
it BEHAVES. Shipping behaviour first would mean PR1 then re-opens every focus
and dismissal assertion against a different DOM, and a test that was rewritten
between the two PRs proves less than one that survived both.

PR1 alone is worth shipping: a grouped, chord-complete nav is an improvement
even if PR2 never lands.

*Alternative recorded:* one PR. Rejected because the negative controls for
"the panel groups correctly" and "Escape closes the panel" would land in the
same diff, and a control whose perturbation could plausibly have reddened
either assertion proves neither.

### D2. `navGroup` is required on EVERY primary-nav route, not only on the nine behind "More"

The same argument v0.23 D6 made for `navSlot`, applied one field over: a route
belongs to a category because of what it IS, not because of where the header
currently puts it. If `navGroup` were carried only by `navSlot: "more"`
entries, then promoting a route to inline would silently delete its category,
and the registry would once again encode a coupling ("position decides
meaning") that v0.22 spent two PRs removing.

So: `navGroup` present on every `inPrimaryNav: true` entry, absent on every
other entry, both directions guarded — exactly the shape `navSlot` already has.

*Alternative recorded:* `navGroup` on the `more` entries only. Cheaper by four
words and wrong for the reason above.

### D3. The four groups, and who is in them

| Group | Routes | Why it is one thing |
| --- | --- | --- |
| **Today** | `/` Dashboard, `/slicer` Slicer, `/focus` Focus, `/execute` Execute, `/review` Review | The plan for today: where it is assembled, where a task is broken down, and the three steps that work it |
| **In the moment** | `/now` Now, `/ambient` Ambient, `/breathe` Breathe, `/challenges` Challenges | The four surfaces that need no plan, no check-in and no account — what you open when today has already gone sideways |
| **Looking back** | `/trends` Trends, `/journal` Journal | The two archives |
| **Account** | `/pricing` Pricing | Membership |

Groups render in registry order, which puts them in that order today.

> **Clarified by PR1, 2026-08-08: "registry order" means the WHOLE registry,
> not the subset a surface happens to render.** Written the obvious way — order
> each surface's groups by their first appearance in that surface's own list —
> the panel and the dialog disagree. The panel holds no `/` and no `/now`, so
> its first Today entry is `/focus` and its first In-the-moment entry is
> `/ambient`, which renders **In the moment** first there and **Today** first
> in the dialog: two surfaces teaching a reader two different shapes for the
> same twelve routes, from the same registry, with no drift for a drift guard
> to find. Done-when clause 4's "in the same order as the panel" is what
> caught it, red, before any of it shipped. `navGroupOrder()` in
> `src/lib/routes.ts` is the fix and `route-registry-guard.test.ts` asserts a
> SUBSET orders its categories the same way the whole nav does.

Two properties of this split are worth stating because they were tested against
the tree rather than chosen for symmetry:

- **Each of the three inline routes is the head of a different concern.** `/`
  and `/slicer` are Today, `/now` is In the moment. So the three links a reader
  sees without opening anything already advertise two of the four groups, and
  "More" is where the other two live. That is a coincidence of v0.23 D3's
  choices, not a constraint — but it means the taxonomy does not fight the
  header shape that was measured into place.
- **Every group has at least one member behind "More"** (Today 3, In the moment
  3, Looking back 2, Account 1), so the panel renders four headings over nine
  items with no empty section. The rule below still handles the empty case,
  because a future re-slotting could create one.

*Alternatives recorded:* three groups, folding Account into Looking back —
rejected because "Pricing" under "Looking back" is actively misleading. Five
groups, splitting `/slicer` out as Tools — rejected because it renders as a
heading with nothing under it (its only member is inline), which is a heading
that teaches the reader nothing.

### D4. The panel renders one labelled list per group, and only for groups that have something to show

Each group with at least one `navSlot: "more"` member renders as a `<ul>`
labelled by its own heading (`aria-labelledby` pointing at a visible heading
element), in registry order, with its member links as `<li>`s in registry
order. A group with no `more` members renders nothing at all — no empty
heading.

The heading is a real element, not a `aria-label` string, because the whole
point is that a sighted reader sees four short lists instead of one long one;
an invisible-only label would fix the screen reader and leave the visual
problem exactly where section 1a found it.

*Alternative recorded:* `<optgroup>`-style separators with no text. Rejected:
a rule between items says "these differ" and never says how, which is the
cheapest possible version of this milestone and buys almost nothing.

### D5. The keyboard dialog adopts the same groups, because it reads the same registry

`keyboard-help.tsx` builds its "Go to X" rows from `goToRoutes()` (v0.22 D6).
Those rows gain the same group headings in the same order, derived the same
way. Nothing is written down twice: if a route changes category, both the
panel and the dialog move it, and no drift guard is needed between them
because there is nothing to drift.

This is the reason (2) belongs with (1) rather than in its own PR: the dialog
grows from seven navigation rows to twelve in the same edit that gives it
headings to put them under, so twelve rows read as four short lists rather
than as one longer list.

The five hand-authored non-navigation rows (`?`, `Esc`, arrows, Tab, Enter)
stay hand-authored and stay outside the groups, unchanged from v0.22 D6.

### D6. Every primary-nav route gets a chord: `s`, `a`, `b`, `c`, `p`

`/slicer` -> `g s`, `/ambient` -> `g a`, `/breathe` -> `g b`,
`/challenges` -> `g c`, `/pricing` -> `g p`. All five letters are unclaimed
(section 1b), and the existing "assigns each chord key to exactly one route"
assertion keeps it that way.

The objection is written down in the backlog entry this closes, and it is a
real one: *a twelve-chord alphabet is its own choice-load problem in an app
whose product rules are about calm.* Three things answer it:

1. A chord is not a decision surface. It is invisible until a reader presses
   `?`, so it costs nothing to the person who never does — unlike a nav pill,
   which every reader pays for on every page. The thing v0.23 measured and cut
   was the surface, not the shortcut list.
2. The alternative is an accessibility asymmetry with no principle behind it.
   Seven routes are one keystroke away; five are reachable only by tabbing into
   a disclosure and through it. Nothing about those five makes them less worth
   reaching — `/slicer` is the largest surface in the repo and the one the
   product names itself after.
3. D5 makes twelve rows legible. The choice-load argument is really an argument
   about a long undifferentiated list, which is the same argument this whole
   milestone is about, and grouping is the answer in both places.

*Alternative recorded:* keep the chord list at seven and write down that it is
deliberately the daily loop plus the two archives. That is the other clearing
condition the backlog entry names, and it stays available: flipping this
decision means deleting five `goToKey` fields and one done-when clause.

### D7. The disclosure stays a native `<details>` and gains the two missing behaviours

`Escape` while the panel is open closes it and returns focus to the `<summary>`.
A pointer-down outside the disclosure closes it. Both are added to the existing
element, in the same component, with the same shape `keyboard-help.tsx`
already uses for its dialog.

This deliberately does NOT swap in the `<button aria-expanded>` popover that
D4 priced. That swap buys the same two behaviours and additionally throws away
what `<details>` gives for free — it opens with no JavaScript at all, the
platform announces it, and its open state crosses no hydration boundary. Paying
the popover's price for behaviour we can add in two handlers is a bad trade,
and the trade only looked forced because D4 stated the cost without stating
that it was addable.

Focus return is not optional decoration: without it, `Escape` closes a menu and
leaves focus on a link that is no longer visible, which is worse for a keyboard
reader than not closing at all.

*Alternative recorded:* accept the platform behaviour and write down that a nav
disclosure is not a modal. That is the other clearing condition the backlog
entry names. It is a defensible position for a disclosure holding two items;
for one holding nine, on every page, it is the reason this milestone exists.

**As shipped in PR2, with the one decision the doc did not anticipate.** Both
handlers read `details.open` from the DOM rather than mirroring it into React
state, so a native toggle cannot desync them and nothing about the element's
hydration story changes. The Escape handler bails on an already-handled event
but deliberately does NOT call `preventDefault` itself: an open `<details>` has
no default action for Escape to suppress, and claiming the event would silently
disable `keyboard-help.tsx`'s own Escape handler on the render where both are
open. This listener is on `document` and that one is on `window`, so a bubbling
keydown reaches this one first regardless of mount order — which is precisely
why not claiming it matters. The outside-click handler tests CONTAINMENT rather
than closing on any pointer-down (pressing a link in the panel is itself a
pointer-down) and deliberately does not move focus, because the reader is
already pointing at what they meant to reach.

### D8. The guards are EXTENSIONS of `route-registry-guard.test.ts`, so no PR in this milestone changes the guard-suite file set

Every new assertion in both PRs lands in
`src/app/__tests__/route-registry-guard.test.ts`, which already owns
"the header's two halves are declared, not positional" and "the keyboard
dialog is derived from it" — the two describe blocks this milestone extends.
PR2's browser assertion lands in `e2e/nav-shape.spec.ts`.

This is a deliberate scheduling decision, not an accident of convenience.
`src/__tests__/roadmap-guard-count.test.ts` discovers guard suites by listing
`.test.ts` files on disk (`discoverGuardSuites`, lines 82-96) and compares the
count against a **Nineteen** written in `docs/ROADMAP.md`. If either PR added a
suite file, the count word would have to move in that same PR — it cannot be
scheduled independently, because the guard reads the filesystem and not the
plan. `ROUTE_VOCABULARY.md` D8 records what learning that the hard way cost.
Here the file set does not change at all, so the obligation does not exist and
the word stays Nineteen through the whole milestone. Stating that at
definition time is cheaper than discovering it at implementation time.

If an implementer decides a separate suite is genuinely better, that is a fine
call to make — and the guard-count word moves in the SAME PR that adds the
file.

---

## 4. Done-when, each clause checkable by CI rather than by opinion

Carried in `docs/ROADMAP.md`'s `### v0.24` section, which is the checkable
copy. None of the clauses is an existence grep: each names a behaviour and a
perturbation that must redden it.

---

## 5. Explicitly NOT in scope, each with its trail

- **Restructuring the sync/help/theme actions cluster.** Still the whole
  remaining 138 px on phones, still worth roughly 40 px, still its own item
  with its own before/after measurement obligation. A taxonomy change does not
  touch it and folding it in would make neither measurable.
- **Replacing `<details>` with a popover.** D7 buys the two behaviours D4
  priced without paying for the swap; if the popover is ever wanted it should
  be wanted for a reason D4 did not already reject.
- **A visual redesign of the panel.** Groups get headings and list semantics;
  the existing `.site-nav-more-panel` type scale, spacing and colour
  conventions stay exactly as v0.23 shipped them. A taxonomy whose evidence is
  tangled with a restyle is a taxonomy nobody can evaluate.
- **The silent-migration product question** filed by PR #153. Unrelated
  surface, still open, still needs a decision of its own.
- **`/monetization`.** v0.22 settled it: out of the nav, still live, still
  linked from the dashboard's collapsed insights. It gains no group and no
  chord, and D2's "absent on every other entry" direction is what keeps that
  true.
- **The `e2e` required-context promotion.** A DevSecOps item with its own
  dated clearing condition and its own evidence step (pull the run history
  first). PR2 adds an assertion to that suite; it does not change what the
  suite is required to be.
- **`src/app/**` behaviour coverage.** A QA-stream finding with its own cadence
  slot, not a milestone.

---

## 6. User decisions recorded by this document

*(Empty. Silence ships the defaults in section 3, per the convention v0.15
through v0.23 followed. Anything the user says goes here verbatim, with the
date.)*
