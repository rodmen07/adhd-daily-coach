# v0.23 - A front door that fits: the header stops being the only way in, and stops taking a third of the screen

Status: **SHIPPED 2026-08-08**, both halves, on every default in section 3.
PR1 (PR #160) shipped D5 and D8 - the six second doors on the dashboard, plus
`src/app/__tests__/route-door-census.test.ts` and the guard-count word.
PR2 (PR #162) shipped D2, D3, D4, D6 and D7 - the collapse itself, the
`navSlot` registry field, `e2e/nav-shape.spec.ts` and the `0.23.0` bump.

**Section 1a's table is now the BEFORE picture, not the live one.** Measured
the same way after the collapse, on the export built from PR2's branch: **138
px at 375x667 (20.7%, one row, 4 items), 138 px at 412x823 (16.8%), 138 px at
360x740 (18.6%) and 67 px at 1280x720 (9.3%)** - exactly the figures D2's
"3 links + More" row predicted, and the reason that row is bolded there. The
before column is deliberately left in place rather than overwritten: the
numbers this milestone was argued from are what make the ceilings in D7 legible
to the next reader.

Every decision below is an **overridable default**: silence ships it, one word
from the user flips it. This document is the product analyst's proposal, not a
decision already taken. Section 6 records anything the user actually says, and
is empty until then.

Companion to `docs/ROADMAP.md`'s `### v0.23` section, which carries the
done-when. This file carries the evidence and the reasoning.

---

## 1. Premise, measured and verified at source

Every number in this section was measured on the **shipped static export** at
`776ab2b` (main, 2026-08-08) - `npm run build` into `out/`, served by the same
`e2e/serve.mjs` the E2E and Lighthouse harnesses use, driven by the repo's own
Playwright chromium. Nothing is inherited from a previous design doc, and
nothing is estimated from the CSS.

### 1a. The sticky header eats a quarter to two fifths of the viewport

`layout.tsx:64` wraps the primary nav in `<header className="site-nav-shell">`,
and `globals.css:134-141` makes that header `position: sticky; top: 0`. So its
height is not a one-time cost at the top of the page; it is permanently
subtracted from the reading area, on every route.

Measured header height, identical on `/`, `/now/` and `/pricing/`:

| viewport | header | share of viewport | nav rows | links |
| --- | --- | --- | --- | --- |
| 375x667 (iPhone SE class) | **264 px** | **39.6%** | 4 | 12 |
| 412x823 (Lighthouse mobile default) | **222 px** | **27.0%** | 3 | 12 |
| 360x740 | **264 px** | **35.7%** | 4 | 12 |
| 1280x720 (the e2e project's Desktop Chrome) | **180 px** | **25.0%** | 2 | 12 |

The desktop row is the one that makes this not a mobile bug.
`.site-nav-inner` is capped at `max-width: 56rem` (`globals.css:144`), so the
nav never gets more than 896 px however wide the window is, and twelve pills do
not fit in 896 px. At 1280x720 the header still wraps to two rows and still
takes a quarter of the window.

### 1b. Nothing in the app is responsive about the nav

Verified by exhaustive search rather than by reading the component:
`src/app/globals.css` is the only stylesheet the app ships (`find . -name
'*.css'` outside `node_modules`, `.next`, `out` and `coverage` returns it and
nothing else), it contains exactly **two** `@media` blocks - `max-width: 640px`
at line 1304 and `prefers-reduced-motion: reduce` at line 1354 - and the first
one targets `.step-card`, `.panel`, `.flow-gates`, `.plan-meta-grid`,
`.action-rail`, `.pricing-grid`, `.monetization-analytics-grid` and
`.close-actions`. **No rule anywhere targets `.site-nav-shell`,
`.site-nav-inner`, `.site-nav-links` or `.site-nav-actions` at any breakpoint**,
and neither `layout.tsx` nor `site-nav.tsx` carries a single `sm:` / `md:` /
`lg:` Tailwind prefix. There is no drawer, no disclosure and no toggle: the only
`<details>` in `src/app` is the dashboard's "Workspace insights" collapsible at
`page.tsx:708`. The twelve-pill row is the entire design at every width.

### 1c. THE FINDING THAT REVERSES THE OBVIOUS FIX: six routes have no other door

This milestone began as "the nav is too long, collapse it". A census run before
anything was written falsified that plan.

Every in-app link to each route, counted across `src/app/**` and `src/lib/**`,
**excluding** tests and excluding the three surfaces that are themselves the nav
(`site-nav.tsx`, `keyboard-help.tsx`, `routes.ts`):

| route | other doors | where |
| --- | --- | --- |
| `/` | 7 | `ambient`, `breathe`, `challenges`, `now`, `pricing`, `slicer` pages |
| `/focus` | 3 | dashboard rail |
| `/review` | 3 | dashboard rail, `execute` page (loop) |
| `/pricing` | 3 | `subscription-guard.tsx`, `monetization`, dashboard |
| `/execute` | 1 | `focus` page (loop) |
| `/now` | 1 | dashboard rail (`page.tsx:377`) |
| `/monetization` | 1 | dashboard, inside the collapsed insights disclosure |
| **`/slicer`** | **0** | - |
| **`/ambient`** | **0** | - |
| **`/breathe`** | **0** | - |
| **`/challenges`** | **0** | - |
| **`/trends`** | **0** | - |
| **`/journal`** | **0** | - |

Half the primary nav is reachable from nowhere else in the product. Cross that
with the chord table (`routes.ts` gives `goToKey` to `/`, `/now`, `/focus`,
`/execute`, `/review`, `/trends`, `/journal` and to nothing else) and it gets
sharper: **`/slicer`, `/ambient`, `/breathe` and `/challenges` have exactly one
affordance each in the entire app** - a pill in a header that already wraps to
four rows on a phone. `/slicer` is the largest surface in the repo at 729 lines
and its own `<h1>` reads "ADHD Task Slicer".

So the naive fix - collapse the header behind a "More" disclosure - would take
four routes' only door and hide it one interaction deeper, while calling it a
usability improvement. That is why this milestone is two things in a fixed
order, and why the reachability half ships first.

### 1d. What the daily loop already does for itself

`SwipeStepCard` carries `previousHref`/`nextHref` and turns them into swipe
gestures, ArrowLeft/ArrowRight handlers and secondary buttons
(`swipe-step-card.tsx:46,52,86,92,133,138`). It is wired `/focus` ->
`/execute` -> `/review` -> `/` (`focus/page.tsx:49`, `execute/page.tsx:60,62`,
`review/page.tsx:120,122`). The three loop steps therefore have a dedicated
contextual path that does not depend on the header at all, which is the reason
they are not the routes that need an inline slot.

---

## 2. What v0.23 is

Two halves, in this order, and the order is the design:

1. **Every route gets a second door.** The six routes with none get a real,
   contextual in-app entry point, and a guard makes "reachable only from the
   header" fail CI from then on.
2. **Then the header collapses to one row**, measured, at every viewport the
   repo already tests.

Half 2 without half 1 is a regression wearing a redesign's clothes. Half 1
without half 2 is worth shipping on its own, which is the property that makes
the split safe.

What v0.23 is NOT: a visual redesign of the header, a grouping taxonomy for the
whole product, or a change to what any route DOES. No page's content changes.

---

## 3. Decisions (every one an overridable default)

### D1. Two PRs, reachability first

**Default:** PR1 ships the second doors plus the door-census guard and changes
the header not at all. PR2 ships the header collapse plus its measurement
harness, the `0.23.0` bump and the heading flip.

**Alternative considered:** one PR. Rejected because the diff would mix a
content-surface change with a layout change and the census guard would land in
the same commit as the layout it is supposed to be independent of, so a reviewer
could not tell which half a red belonged to.

**Note for whoever implements PR1 (L-042 class, and this repo has the receipt):**
the census guard is a `.test.ts` under `src/app/__tests__/`, so
`roadmap-guard-count.test.ts` discovers it the moment the file exists. The
roadmap's count word therefore goes **Seventeen -> Eighteen in PR1**, not in
PR2. That obligation is not schedulable; see `ROUTE_VOCABULARY.md` D8, where
v0.22 learned this the same way. PR2's own harness is a Playwright spec under
`e2e/`, which that guard does not scan, so PR2 bumps nothing.

### D2. Three links stay inline, plus one "More"

**Default:** the header renders three route links and one disclosure.

This number is measured, not chosen. Candidate shapes were prototyped in the
browser against the real export and measured the same way as section 1a:

| shape | 375x667 | 412x823 | 1280x720 | rows at 375 |
| --- | --- | --- | --- | --- |
| today: 12 flat | 264 px (39.6%) | 222 px (27.0%) | 180 px (25.0%) | 4 |
| 5 links + More | 180 px (27.0%) | 180 px (21.9%) | 96 px (13.3%) | 2 |
| 4 links + More | 180 px (27.0%) | 180 px (21.9%) | 96 px (13.3%) | 2 |
| **3 links + More** | **138 px (20.7%)** | **138 px (16.8%)** | **67 px (9.3%)** | **1** |
| all 12, one scrolling row | 138 px (20.7%) | 138 px (16.8%) | 138 px (19.2%) | 1 |

Four items (three links plus More) is the largest set that stays on **one row**
at 375x667; five items already wraps. 138 px is the floor for this header
structure at that width regardless - below four items the nav row is 34 px and
everything above it is the title plus the sync/help/theme cluster - so
"restructure the actions cluster too" is explicitly out of scope and the
done-when is set against 138, not against zero.

**Alternative considered and rejected: a horizontally scrolling row of all 12.**
It matches the 138 px figure on phones, but it is *worse on desktop* (138 px vs
67 px, because the twelve pills keep the actions cluster on its own line), it
introduces horizontal scrolling as a navigation mechanism, and it reduces choice
load by exactly zero - it just moves the choices off-screen where no keyboard
user will find them without arrowing through. Recorded here so it is not
re-proposed.

**Alternative worth a word from the user: five inline** (the daily loop:
Dashboard, Now, Focus, Execute, Review). It keeps the loop one tap away at the
cost of two header rows on a phone, 180 px rather than 138 px. If the loop
mattering more than the 42 px is the call, this is the one to flip.

### D3. Which three: Dashboard, Now, Slicer

**Default:** `/` (Dashboard), `/now` (Now), `/slicer` (Slicer).

Chosen by a stated rule rather than by taste, and the rule is only legal
*after* PR1, when every route has a second door and the inline slot stops being
a reachability decision:

- `/` is where the day is assembled and where the loop returns
  (`review/page.tsx:122`), and seven in-app links already point at it.
- `/now` is the one route useful with no plan, no check-in and no account -
  `routes.ts` says exactly that at its D4 comment.
- `/slicer` is the largest surface in the app (729 lines), the one the product
  names itself after in its own `<h1>`, and today it has zero other doors and no
  chord.

The three loop steps are deliberately not here: D1's evidence (section 1d) is
that they already carry each other.

**Alternatives:** swap `/slicer` for `/breathe` (the route whose value is
immediate and needs no data at all, a reasonable "in overload, one tap" case),
or for `/journal`. Any of the three is a one-line registry change.

### D4. "More" is a native `<details>`, not a custom popover

**Default:** a `<details>`/`<summary>` styled as a pill, holding the remaining
nine links.

The repo already uses exactly this for the dashboard's "Workspace insights"
(`page.tsx:708`, `.insights-collapsible`), so it is the established vocabulary
rather than a new one. It needs no JavaScript, it is keyboard-operable and
screen-reader-announced by the platform, its open/closed state survives no
hydration boundary because there is nothing to hydrate, and it cannot trap
focus.

**Stated cost, not hidden:** native `<details>` does not close on `Escape` and
does not close on an outside click. Whether that is acceptable for a navigation
menu is a real question.

**Alternative:** a `<button aria-expanded>` plus a popover, with Escape-to-close
and outside-click-to-close, matching `keyboard-help.tsx`'s existing dialog
handling. Costs client JS and a focus-management test; buys the two behaviours
above.

**One behaviour PR2 added that this decision did not name, recorded here rather
than left in a PR body.** The disclosure closes when a link inside it is
chosen. Client-side navigation does not remount `SiteNav`, and a `<details>`
keeps its open state in the DOM rather than in React, so the menu would
otherwise hang open over the page the reader just navigated to - a wart D4
neither predicted nor argued for. It is four lines on a ref, not the popover
alternative: the two costs above are unchanged and still stand, and
`route-registry-guard.test.ts`'s "closes the disclosure when a link inside it
is chosen" is the assertion that goes red if the handler is removed.

### D5. The second doors go on the dashboard, in the existing vocabulary

**Default:** the dashboard grows two link groups using the `.action-rail` /
`.insights-collapsible` patterns it already has - "Calm tools" (`/slicer`,
`/ambient`, `/breathe`, `/challenges`) and "Looking back" (`/trends`,
`/journal`) - and nothing else moves.

The dashboard is the right host because it is already the hub: seven pages link
back to it, and it already carries the contextual rail for `/focus`, `/review`
and `/now`.

**Alternative:** a site footer rendered by `layout.tsx` listing every route,
which reaches every route from every route rather than only from `/`. Rejected
as the default because it adds a second permanent navigation surface to solve a
problem caused by the first one being too big, and because a footer under a
`flex-1` main is easy to ship in a state nobody scrolls to. Worth flipping to if
the user wants reachability independent of the dashboard.

### D6. The registry gains one field, and the guard reads it

**Default:** `RouteEntry` gains `navSlot: "inline" | "more"`, required for every
entry with `inPrimaryNav: true` and absent on the others. `primaryNavRoutes()`
is unchanged; two new helpers `inlineNavRoutes()` and `moreNavRoutes()` split
it, in registry order.

**Alternative:** no field at all - take the first three `inPrimaryNav` entries
in registry order. Rejected because it couples "where a route sits in the list"
to "whether it is behind the disclosure", so reordering the nav silently
re-slots it, which is exactly the class of implicit coupling v0.22 spent two PRs
removing.

### D7. The measurement is a Playwright spec, and it asserts pixels AND rows

**Default:** `e2e/nav-shape.spec.ts` loads `/` at 375x667, 412x823 and
1280x720 and asserts, at each: the `.site-nav-shell` bounding height is at or
under its ceiling, AND every `.site-nav-links` child shares one `top`
coordinate (one row), AND `document.documentElement.scrollWidth` does not exceed
the viewport width (no horizontal scroll).

Ceilings default to **150 px** at 375x667, **150 px** at 412x823 and **100 px**
at 1280x720 - the measured achievable figures (138/138/67) with headroom for
font-metric noise across chromium versions, against today's 264/222/180.

Both halves are asserted because either alone is fakeable: a pixel ceiling alone
is satisfied by shrinking the font, and a row count alone is satisfied by the
scrolling row D2 rejected. The no-horizontal-scroll clause is what closes that
second door explicitly.

**Alternative:** assert a percentage of viewport height instead of pixels.
Rejected: the percentage is the number a reader feels, but it moves when the
viewport list changes, and the viewport list is the thing most likely to grow.
The percentages are recorded in this document beside every pixel figure so the
reader gets both.

### D8. The census guard names what it found, and cannot go quiet

**Default:** `src/app/__tests__/route-door-census.test.ts` walks every
`src/app/**/page.tsx` and every `src/app/components/**` file, excluding
`site-nav.tsx`, `keyboard-help.tsx` and tests, collects every literal route
target in both the `href="/x"` and the `href: "/x"` forms, and fails when an
`inPrimaryNav: true` route has zero. A zero-length scan is a hard failure, and
at least two independently named anchor files must be found, so a walker that
goes blind announces itself rather than reporting a clean census of nothing.

**Alternative:** assert reachability by crawling the built `out/` with
Playwright. Stronger in principle - it would catch a link that exists in source
but renders only behind a condition - but it needs a full build per run and it
belongs in the `e2e` job rather than the required gate. Recorded as a follow-up
rather than a default.

---

## 4. Done-when, each clause checkable by CI rather than by opinion

None of these is an existence grep, and none can be satisfied by a comment or a
doc string.

1. `src/app/__tests__/route-door-census.test.ts` exists and **passes**, and it
   has been observed **failing** against `main` at `776ab2b`, naming
   `/slicer`, `/ambient`, `/breathe`, `/challenges`, `/trends` and `/journal`.
   The observed red is quoted in PR1's body.
2. Every route with `inPrimaryNav: true` is linked from at least one file that
   is neither `site-nav.tsx` nor `keyboard-help.tsx` - enforced by clause 1, not
   asserted in prose.
3. `src/lib/routes.ts` carries `navSlot` on every `inPrimaryNav: true` entry,
   exactly three are `"inline"`, and `route-registry-guard.test.ts` fails if a
   primary-nav entry has no slot or if the rendered header shows a different
   set. Proven by a control that flips one entry's slot and reddens the guard.
4. `e2e/nav-shape.spec.ts` passes at all three viewports with the ceilings in
   D7, and has been observed failing against `main` at `776ab2b` with the
   measured 264 / 222 / 180 px.
5. The "More" disclosure is reachable and operable by keyboard alone, and every
   link inside it is in the tab order once open - asserted in the same spec.
6. `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run
   build` and `npm audit --audit-level=high` are green on both PRs, and the
   `lighthouse` context's existing CLS and LCP assertions do not regress
   (a header that changes height must not do it after first paint).
7. After PR2: `package.json` reads `0.23.0` with both `package-lock.json`
   copies, this milestone's heading reads DONE, and
   `roadmap-milestone-status.test.ts` and `roadmap-version-claim.test.ts` are
   both green with it - the second of which did not exist when v0.22 closed and
   exists precisely so clause 7 cannot be half-done.
8. The roadmap's guard-count word reads **Eighteen** and names
   `route-door-census`, updated in **PR1** (see D1's note).

---

## 5. Explicitly NOT in scope, each with its trail

- **Restructuring the sync/help/theme actions cluster.** It is what holds the
  138 px floor at 375 px, so removing it would buy roughly another 40 px. It is
  a separate surface with its own tests, and mixing it in would make the header
  measurement unattributable. Filed as a follow-up rather than done here.
- **A grouping taxonomy for the whole product** (the "is a flat 12-item nav
  right" question filed by PR #155). This milestone answers "does it fit" and
  "is it the only door", not "what are the categories". If the user wants
  groups, `navSlot` is the field a `navGroup` would sit beside.
- **`/monetization`.** v0.22 settled it: out of the nav, still live, still
  linked from the dashboard's collapsed insights. It has one door and that is
  the intent, so the census guard checks `inPrimaryNav: true` routes only.
- **Route-level gating.** `subscription-guard.tsx` owns `GATE_EXEMPT_ROUTES`,
  settled by v0.14, and nothing here touches it.
- **The silent-migration product question** filed by PR #153. Unrelated surface,
  still open, still needs a product decision of its own.
- **`/journal/` and `/trends/` joining the Lighthouse gate.** Standing candidate
  with its own cost argument in `lighthouserc.cjs`; a nav change does not make
  it cheaper.

---

## 6. User decisions recorded by this document

*(Empty. Silence ships the defaults in section 3, per the convention v0.15
through v0.22 followed. Anything the user says goes here verbatim, with the
date.)*
