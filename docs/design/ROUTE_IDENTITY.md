# v0.25 - Every room has a name, and the browser learns it: one title per route

Status: **DEFINED 2026-08-08** (product-role increment), the milestone after
v0.24. Not started.

Design authority: this document. Every decision below is an **overridable
default** - one word from the product owner flips any of them, and after v0.25
ships each flip is a one-line edit in `src/lib/route-metadata.ts` rather than a
redesign, for the same reason `navGroup` made a taxonomy change a field edit.

Section 6 is empty on purpose and is where a user decision gets recorded.

---

## 0. Where this sits in the arc

Four milestones have now been spent on one question, each one narrower than the
last, and each built on the registry the one before it created:

| Milestone | Question | Answer it shipped |
|---|---|---|
| v0.22 | Which doors exist? | `src/lib/routes.ts`, one registry, four hardcoded lists retired |
| v0.23 | Can a person get through them, and does the header fit? | a second door per route; 264 px -> 138 px |
| v0.24 | What do the doors MEAN? | `navGroup`, four labelled categories, a chord per front door |
| **v0.25** | **Once you are through, does anything OUTSIDE the page say which room you are in?** | **one `<title>` per route, derived from the same registry** |

v0.22 through v0.24 all worked on the *inside* of the page - the header, the
panel, the dialog. Everything a person carries *out* of the page still says the
same thing on all thirteen routes: the tab, the history entry, the bookmark,
the shared link, and - this is the part that is not cosmetic - the sentence a
screen reader is given when a navigation completes.

---

## 1. Premise, verified at source rather than inherited

Every claim in this section was produced by the command printed beside it,
against the tree at `62c6d7e` and against the **deployed artifact**, not
inherited from a backlog entry. Two of them contradict what the first pass of
this document asserted, and both corrections are kept in place rather than
quietly fixed, because the shape of the mistake is the reusable part.

### 1a. All thirteen routes serve one identical `<title>`

Against the live Pages deployment, not the source:

```
for r in "" "slicer/" "journal/" "trends/" "breathe/"; do
  curl -s "https://rodmen07.github.io/adhd-daily-coach/$r" \
    | grep -oE "<title>[^<]*</title>" | head -1
done
```

returns, five times out of five:

```
<title>ADHD Daily Coach: Your friendly self-improvement coach</title>
```

The reason is structural rather than an oversight anyone can be blamed for.
`grep -rln "export const metadata\|generateMetadata" src/app` returns **exactly
one file**, `src/app/layout.tsx:21`, and `head -1` on all thirteen `page.tsx`
files returns `"use client";` on every one - so no page *can* export
`metadata`, because in the App Router a client component may not. Nothing was
skipped; the only shape that was available was the root one.

### 1b. Every route already knows its own name, in three places

This is what makes the milestone small. The name exists three times over:

- `src/lib/routes.ts` carries a `label` on all thirteen entries
  (`Dashboard`, `Now`, `Slicer`, `Ambient`, `Breathe`, `Challenges`, `Focus`,
  `Execute`, `Review`, `Trends`, `Journal`, `Pricing`, `Monetization`).
- Every route renders exactly one `<h1>` with route-specific copy. Measured on
  the deployed HTML across all thirteen routes:
  `curl -s <url> | grep -oE "<h1[^>]*>" | wc -l` returns **1** everywhere, and
  the text is distinct on every route (`Today-first coaching`, `One thing,
  right now`, `ADHD Task Slicer`, `Set your focus`, `Execute your plan`,
  `Review and adjust`, `A quiet page for today`, `Your last 4 weeks`,
  `Simplicity first, no tiers.`, ...).
- The nav renders that label with `aria-current="page"` on the active route
  (`site-nav.tsx:127,160`), so the app already tells a reader where they are
  *while they are looking at the nav*.

> **Correction, recorded rather than removed.** The first pass of this
> premise claimed *"three routes (`/execute`, `/focus`, `/review`) have no
> `<h1>` at all"*, from `grep -c "<h1" src/app/*/page.tsx`, which returns 0 for
> those three files. That claim is **false**, and the rendered check above is
> what falsified it: those three routes render their `<h1>` through
> `SwipeStepCard` (`swipe-step-card.tsx:110`), which each page feeds a `title`
> prop (`execute/page.tsx:58`, `focus/page.tsx:47`, `review/page.tsx:118`).
> A source scan over the file where a thing is *used* cannot see a thing that
> is *rendered by a component it passes a prop to*. Half of a milestone was
> about to be defined on that non-defect. It is left here because the milestone
> is stronger for it: the app is not missing per-route names, it has them and
> the browser is never told.

### 1c. The route announcer is silent on every navigation, because the title never changes

This is the part that turns a cosmetic finding into an accessibility one, and
it is provable from the framework's own shipped source rather than argued.
Next 16.2.11's App Router mounts a route announcer -
`node_modules/next/dist/client/components/app-router-announcer.js` - whose
whole job is to speak the destination after a client-side navigation. Its
effect body, lines 50-67:

```js
let currentTitle = '';
if (document.title) {
    currentTitle = document.title;
} else {
    const pageHeader = document.querySelector('h1');
    if (pageHeader) {
        currentTitle = pageHeader.innerText || pageHeader.textContent || '';
    }
}
// Only announce the title change, but not for the first load because screen
// readers do that automatically.
if (previousTitle.current !== undefined && previousTitle.current !== currentTitle) {
    setRouteAnnouncement(currentTitle);
}
```

Two facts compose into silence:

1. It announces **only on a change**. With one constant title,
   `previousTitle.current === currentTitle` on every navigation, so
   `setRouteAnnouncement` is never called and the announcer node stays empty.
2. It reads `document.title` **in preference to** the `<h1>`, and only falls
   back to the heading when the title is empty. This app has thirteen good
   `<h1>`s (1b) and a title that is always set, so the fallback that would have
   rescued it is unreachable *because* the title is present and wrong.

So a person using a screen reader who presses `g j` or clicks `Journal` in the
"More" panel - both of which v0.22 through v0.24 built specifically to make
those routes reachable - is told nothing at all about where they landed. The
app spent three milestones making twelve doors reachable and never named the
room on the other side.

This is the failure mode the repo already has a name for: a shipped surface
that silently does nothing. It is not visible in any screenshot, no existing
guard can see it, and it costs one field to fix.

### 1d. What it costs everyone else

Not a screen-reader-only defect, just worst there. Thirteen identical tab
titles means: browser history is thirteen indistinguishable rows, so
back-navigation by history is guesswork; a bookmark to `/slicer` is named
"ADHD Daily Coach: Your friendly self-improvement coach"; a person with the app
open in three tabs (the pattern the product's own copy encourages - park a
thing in `/journal`, work in `/now`) cannot tell them apart; and every shared
link previews as the same page.

---

## 2. What v0.25 is

**One PR of substance, plus a closing PR.** Every route's prerendered HTML
carries a `<title>` derived from the registry entry that already names it, the
built export is asserted route by route inside the required gate, and the
announcer's silence is proven broken in a real browser.

It deliberately does **not** touch the nav, the header, the panel, the chords,
or any page's content. The nav arc is finished; this milestone is about what
leaves the page.

---

## 3. Decisions (every one an overridable default)

### D1. Two PRs: the title, then the proof in a browser

**PR1 - "the browser learns the name":** the derivation module, the twelve
segment layouts, the root `title.template`, and the guard that reads the built
export. This is the whole user-visible change.

**PR2 - "and a screen reader hears it":** the chromium assertion that a
client-side navigation both changes `document.title` and puts the destination's
name into the route announcer, plus the `0.25.0` bump, the lockfile copies, and
the roadmap heading flip.

*Alternative considered:* one PR. Rejected because PR2's evidence is the only
evidence for the claim in 1c, and a browser assertion bundled with the change
it is supposed to judge is not an independent check. Splitting also keeps the
`e2e/` change out of the PR that touches thirteen files.

*Why PR2 is not thin:* it is the only PR in this milestone that observes the
announcer at all. PR1 can prove the title is in the HTML; only PR2 can prove
the announcement happens.

### D2. The title comes from the registry's existing `label`, and no new field is added

`ROUTES` already carries `label` on all thirteen entries and the nav, the "More"
panel and the keyboard dialog all render it. A `title` field would be a second
name for the same thing, and the moment two exist they can disagree - which is
the exact defect v0.22 spent two PRs deleting.

*Alternative considered:* a `documentTitle` field for routes whose tab name
should differ from their nav pill. Rejected as a default because no route needs
it today; adding it later is additive and costs one optional field. Recorded
here so the option is not re-litigated from scratch.

### D3. The format is `<Label> · ADHD Daily Coach`, and `/` keeps its exact current title

Using Next's own `title.template` in the root layout:

```ts
title: {
  template: "%s · ADHD Daily Coach",
  default: "ADHD Daily Coach: Your friendly self-improvement coach",
},
```

A child segment exporting `title: "Slicer"` renders `Slicer · ADHD Daily
Coach`; `/` exports no title of its own and therefore keeps the `default`,
**byte-for-byte the string it serves today**.

Three reasons `/` is excluded rather than templated:

1. It is the site's front door; its title is the site's title, and that is the
   string search results and link previews show.
2. `docs/RENAME_RUNBOOK.md:7` records the deployed `<title>` verbatim as the
   evidence that the 2026-07-29 rename completed. Keeping the string identical
   keeps that record true instead of turning a dated observation into a
   sentence that reads as current and is not.
3. It is the smaller diff, and the announcer works from `/` outward: navigating
   away from `/` already changes the title under this scheme.

*Alternative considered:* `Dashboard · ADHD Daily Coach` for `/` too, for
uniformity. It is a one-line flip (give `/`'s segment a title) if the owner
prefers it, and it costs the two records above.

*Alternative considered:* `ADHD Daily Coach · Slicer` (site first). Rejected:
the distinguishing word must come first because a browser tab truncates from
the right, and thirteen tabs all reading "ADHD Daily…" is the defect we are
fixing.

### D4. The logic is hoisted into ONE addressable module; the twelve layouts are three lines each

New `src/app/route-metadata.ts`:

```ts
export function metadataForRoute(path: string): Metadata
```

which looks the path up in `ROUTES` and returns `{ title: entry.label }`, and
**throws on an unknown path** rather than returning a silent fallback - an
unregistered route with a wrong tab name is exactly the kind of thing a fallback
hides. Each segment layout is then:

```tsx
export const metadata = metadataForRoute("/slicer");
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

Server components (no `"use client"`), returning `children` unchanged, so no
DOM node and no styling is added.

The hoist is the point: a guard can *call* `metadataForRoute("/slicer")` and
assert the object it returns. A guard over twelve inline metadata literals could
only grep twelve files, and text that mentions a title is indistinguishable from
a title - the same reason the `<h1>` grep in 1b lied.

*Alternative considered:* set `document.title` in a client `useEffect`.
Rejected on four counts: it never reaches the prerendered HTML, so bookmarks,
shared links, search and the first paint all keep the wrong name; the static
export is the shipped artifact and would still be wrong on disk; it races the
announcer's own effect, which reads `document.title` when the tree changes; and
it cannot be asserted against `out/`.

*Alternative considered:* convert the pages to server components so each can
export its own `metadata`. Rejected: all thirteen are `"use client"` for real
reasons (hooks, state, event handlers), so this is a rewrite of the app wearing
a metadata change's clothes.

### D5. `/monetization` gets a title like every other route

`audience: "internal"` is explicitly not access control - `routes.ts:29-34`
says so - and `/monetization` is a shipped route at a real URL that a person can
bookmark. Giving it a title makes the guard's clause total ("every route in
`ROUTES`") instead of carrying an exception, and an exception is a thing that
later gets copied.

### D6. Descriptions are OUT of scope, and that is a deliberate line

Only the title changes. A per-route `<meta name="description">` is thirteen
sentences of editorial copy, which is a product-owner decision and not something
a milestone should invent quietly on the way past. The root description keeps
applying to every route, which is imprecise but never *wrong* the way a title
that names the wrong page is.

Filed as a candidate rather than smuggled in. If the owner wants it, the module
in D4 is where it lands and it is additive.

### D7. The guard is a NEW suite, and PR1 therefore owns three count obligations

The new assertions do **not** extend
`src/app/__tests__/route-registry-guard.test.ts`: that file is **951 lines**,
already past the comprehension ceiling this project holds itself to, and "what
the browser calls a route" is a different question from "where can I go".

The cost of a new file is real, mechanical, and stated here at definition time
rather than discovered at implementation time - because
`src/__tests__/roadmap-guard-count.test.ts` **discovers suites by listing the
disk** (`discoverGuardSuites`, lines 81-95, `.test.ts` under `src/__tests__`
and `src/app/__tests__`). It goes red on the commit that adds the FILE, not on
a later commit that updates prose. So all three of the following land in **PR1**:

1. `docs/ROADMAP.md`'s guard sentence changes **Twenty -> Twenty-one** and adds
   `` `route-title-contract` `` to its backticked list, because the guard also
   asserts the list names exactly the suites that exist.
2. `NUMBER_WORDS` (line 99) stops at `twenty: 20` (line 115), so `"twenty-one":
   21` must be added or the parser throws
   *"states an unrecognised guard count word"*.
3. The claim regex (line 132) is `/\*\*(\w+)\*\* guard tests now run…/`, and
   `\w` does not match a hyphen, so `**Twenty-one**` fails the match ENTIRELY
   and the parser throws *"no longer contains the guard-suite sentence"*. The
   regex must widen to `[\w-]+` in the same commit.

Obligation 3 is the one that would not have been found by reading the plan: the
count word and the number word map both look like the whole problem, and the
regex silently rejects the fix for them.

*Alternative considered:* extend `route-registry-guard.test.ts` and dodge all
three. It is a legitimate flip - it makes PR1 smaller and touches no guard
plumbing - and it costs growing a 951-line file that every nav increment already
edits. Recorded so the trade is visible.

### D8. The proof is the BUILT export, not the source

The guard reads `out/<route>/index.html` and asserts the real `<title>` served
for each of the thirteen routes, following the pattern
`src/__tests__/serve-compression.test.ts:72-73` already established in this
repo: CI's quality gate runs `npm run build` before `npm run test:coverage`, so
`out/` always exists there, and locally a missing `out/` **fails with the
instruction to build - never skips**, because a skipped gate reports green about
something it did not read.

That is the clause that cannot be faked. A source-level assertion would pass on
a metadata export that Next never applied.

---

## 4. Done-when, each clause checkable by CI rather than by opinion

None of these is an existence grep, and each behavioural clause names the
control that must be observed red.

1. `metadataForRoute(path)` returns `{ title: <that entry's label> }` for every
   one of the thirteen paths in `ROUTES`, derived by looping `ROUTES` rather
   than from a literal list, and **throws** for an unregistered path - the
   throw proven by a case asserting it.
2. `out/<route>/index.html` carries a `<title>` for each of the thirteen routes
   that is (a) **distinct across all thirteen**, (b) equal to
   `<label> · ADHD Daily Coach` for the twelve non-root routes, and (c)
   byte-identical to today's string for `/`. The distinctness clause is
   asserted as a set-size comparison, so it fails the moment any two routes
   collide.
3. The control for clause 2 perturbs the **consumer, not the registry**: delete
   the `export const metadata` line from ONE segment layout, rebuild, and quote
   the red naming that route. Perturbing `ROUTES` instead is unfalsifiable
   here - the guard's expectation and the rendered title would both derive from
   the edited label and move together, which is a green control and therefore
   the failure signal, not the pass.
4. A second control proves clause 2 reads the build and not the source: leave
   the layouts in place, revert `metadataForRoute` to return `{}`, rebuild, and
   quote the red. A source-scanning guard would stay green through this.
5. In chromium (`e2e/`), a client-side navigation from `/` to at least two
   different routes changes `document.title` to that route's expected string,
   asserted after the navigation settles rather than by waiting on a timer.
6. In chromium, after that same navigation the route announcer
   (`#__next-route-announcer__`, inside the open shadow root on
   `<next-route-announcer>`, `role="alert"`) contains the destination's name.
   Control: pin every segment's title to one constant string, rerun, and quote
   the announcer assertion going red with an empty announcer - which is the
   state the app ships in today, so this control also reproduces the 1c defect
   on demand.
7. PR1 lands all three obligations of D7 in the same commit that adds the suite
   file, and `roadmap-guard-count` is green in that commit without a follow-up.
8. The pinned CI gate is green on both PRs (`npm run lint`, `npm run
   typecheck`, `npm run build`, `npm audit --audit-level=high`, `npm run
   test:coverage`, Node 24, all extracted from `.github/workflows/ci.yml:25-56`),
   both required contexts `lint-and-build` and `lighthouse` pass, and the
   non-required `e2e` context stays green.
9. `e2e/nav-shape.spec.ts` still passes its 150 / 150 / 100 px ceilings
   unchanged: twelve segment layouts must not move a pixel of the header.
10. After PR2: `package.json` reads `0.25.0` with both lockfile copies matching
    (`lockfile-version-parity`), the roadmap heading reads DONE
    (`roadmap-milestone-status`), and the Current-state version sentence reads
    `0.25.0` (`roadmap-version-claim`).
11. Every behavioural clause is proven by a control whose perturbation is
    confirmed applied (a diff or a count-assert) and whose named red line is
    quoted, with the implementation committed before the first perturbation.

---

## 5. Explicitly NOT in scope, each with its trail

- **Per-route descriptions and Open Graph tags.** D6. Editorial copy is an
  owner decision; the module in D4 is where it would land, additively.
- **The sync/help/theme header cluster** (filed by PR #159, worth ~40 px on
  phones). Its own surface with its own before/after measurement obligation;
  folding it in would make neither measurable. Unchanged since v0.24 declined
  it for the same reason.
- **The two-Escape-owners interaction** (filed by PR #166: `site-nav.tsx`
  listens on `document`, `keyboard-help.tsx:160` on `window`, resolved by
  bubbling order rather than by anything mechanical). Real, small, and about
  the nav - which this milestone deliberately does not touch. Stays an open
  backlog item.
- **`src/app/**` behaviour coverage** (filed by PR #158; function coverage
  83.58% against the lib layer's 96.12%) and **the rendered-DOM theme guard for
  the four uncovered pages** (filed by PR #165). Both are QA-stream items with
  their own cadence slot; a product milestone should not annex them.
- **The one surviving `background-color: --var` declaration** (filed by PR
  #165), which is emitted from `agents/dev-agent/` - a directory roadmap work
  may never edit.
- **`navGroupOrder()`'s second global read** (filed by PR #164). A watched seam,
  not a defect; nothing in v0.25 touches it.
- **FCM push notifications.** Still console-gated with USER-ONLY setup.
  Re-checked at this definition: unchanged.
- **The silent-migration product question** (filed by PR #153): a rejected
  Firestore write is unreportable by construction. Its own decision, unrelated
  surface.
- **Promoting `e2e` to a required context.** A DevSecOps item with its own
  evidence bar, exactly the one `lighthouse` just cleared. v0.25 adds e2e
  assertions and therefore should not also be the increment that decides they
  gate.

---

## 6. User decisions recorded by this document

*(Empty. Every decision above ships on its default unless a line is added here.
The most likely candidates, in the order they are cheapest to flip: D3's
exclusion of `/` from the template, D6's exclusion of descriptions, and D7's
choice of a new suite over extending `route-registry-guard.test.ts`.)*
