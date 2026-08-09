# v0.27 — Thirteen rooms, one business card: per-route descriptions and link previews

**Status: DEFINED 2026-08-08, not started.** Review-gate design doc for the
v0.27 milestone. Every decision below is an **overridable default**: silence
ships it, one word from the owner flips it, and section 6 stays empty until
then. Done-when clauses live in `docs/ROADMAP.md`'s `### v0.27` section; this
file records the reasoning and the alternatives.

## 1. The finding, measured on the deployed artifact

Measured 2026-08-08 with `curl` against the live Pages build (all thirteen
routes, not a sample):

- **Every route serves the identical `<meta name="description">`** — the root
  layout's sentence ("Your ADHD friendly self-improvement coach. Small,
  deliberate daily steps that fit how your brain works.") appears exactly once
  on all thirteen, and no route says anything about itself. A search result or
  preview for `/breathe` (a guided breathing pause) and one for `/pricing`
  (the $5/month membership) read word-for-word the same.
- **Zero Open Graph or Twitter tags anywhere**: `grep -cE
  'property="og:|name="twitter:'` returns 0 on every route. A link to any room
  in this app, pasted into a chat or a feed, unfurls with no description of
  where it goes — the platform falls back to scraping whatever it likes.

This is v0.25's finding one level out. v0.25 gave every room a NAME and proved
the browser announces it; the browser is still handed nothing about what any
room IS. And unlike the title, this gap is invisible in the product itself —
it only shows where the app is being *referred to*: search results, link
previews, bookmarks managers, share sheets.

Why this is structural rather than an oversight, verified at source (same
mechanism as v0.25 §1a): every `page.tsx` is `"use client"` and cannot export
metadata; the twelve server segment layouts v0.25 added export exactly
`metadataForRoute(path)`, and that function returns `{ title: entry.label }`
and nothing else — its own doc comment says so and names this milestone as the
place descriptions would land: *"If descriptions are ever wanted, this
function is where they land, additively."* (`src/app/route-metadata.ts`,
SCOPE paragraph.)

Why now and not earlier: the v0.25 and v0.26 definitions both named this the
strongest candidate and both declined it because thirteen sentences of
editorial copy are an owner decision. That is what this document is for: the
thirteen sentences are DRAFTED below as overridable defaults (D6), the same
review-gate mechanism that shipped v0.24's group names and membership. The
definition PR is the approval surface; nothing ships until a later dev slot
takes the implementation PR, so the owner has the whole window between the two
to override any sentence.

## 2. What v0.27 is

**Every route tells the world what it is: a distinct `<meta
name="description">` and an Open Graph block on all thirteen routes, derived
from the same registry that already names them.**

Not in scope, each with its reason recorded in section 5: og:image assets,
twitter-specific tags, JSON-LD/structured data, sitemap.xml, and any change to
what a page renders — this milestone, like v0.25, leaves every pixel alone.

## 3. Decisions (each an overridable default)

### D1. The copy lives in the registry: `RouteEntry` gains a required `description`

`src/lib/routes.ts` is the one route vocabulary (v0.22), and it already
carries the pattern for a field required everywhere: `label`. `description:
string` becomes required on **every** entry, all thirteen including
`/monetization` — the same "no exemptions in an otherwise total rule"
argument the v0.25 monetization layout records. The existing
`route-registry-guard.test.ts` gains the both-directions clauses (present on
all, non-empty, pairwise distinct, and a length ceiling — D6).

*Alternative recorded:* a separate `ROUTE_DESCRIPTIONS` record in
`route-metadata.ts`, keyed by path. Rejected as a second registry: it would
need its own key-set-equality guard against `ROUTES`, which is exactly the
two-lists drift v0.22 spent two PRs removing.

### D2. Derivation, not layout edits: `metadataForRoute()` widens its return

`metadataForRoute(path)` returns `{ title, description, openGraph }` instead
of `{ title }`. The twelve segment layouts already export its return value
**verbatim**, so they pick the widening up with zero edits — this is the
payoff of v0.25's one-module argument, and it is why the implementation diff
stays small. The throw-on-unregistered-path behaviour is unchanged.

### D3. `/` keeps its exact sentence; the root layout gains the shared pieces

The root description string stays **byte-for-byte** what it is today — it is
the site's sentence in search results, and this milestone has no evidence it
should change. It moves into `/`'s registry entry as its `description` (one
home, D1), and the root layout reads it from there or keeps the literal with a
guard asserting the two agree — implementation's choice, but the built `/`
output must be byte-identical either way (done-when clause 2).

The root layout additionally gains `metadataBase` (D4) and its own
`openGraph` block so `/` previews like every other room.

### D4. Open Graph: title, description, url, type, siteName — and the basePath trap named

Each route's `openGraph` carries `title` (the route's title as served),
`description` (same sentence as the meta description — one voice, not two),
`url` (that route's canonical deployed URL), `type: "website"`, and
`siteName: "ADHD Daily Coach"`.

**The hazard the implementation must not learn the hard way:** the deployed
site lives under a project-page basePath
(`https://rodmen07.github.io/adhd-daily-coach/`), and `new URL("/now/",
base)` resolves against the ORIGIN, silently dropping the base's path — the
classic project-pages trap. `site-base-path.mjs` already derives `SITE_URL`
and `next.config.ts` already inlines it as `NEXT_PUBLIC_APP_URL`, so the
pieces exist; whether the implementation sets `metadataBase` and relative
urls, or composes absolute urls itself, is its choice. What is NOT its choice
is the evidence: done-when clause 3 asserts the **built artifact's** `og:url`
equals `<site>/<route>/` (the trailing-slash form the export serves), so a
dropped basePath is a red, not a surprise.

*Alternative recorded:* omit `og:url` entirely (platforms fall back to the
pasted URL). Rejected as a half-measure while the trap is guarded anyway.

### D5. No og:image in this milestone

A preview image is a design asset only the owner can supply; a generic or
wrong image is worse than none, and every platform renders a text-only unfurl
fine. When an image exists, Next's per-segment `opengraph-image` convention is
the additive home. Same shape as v0.25 D6: filed, not smuggled.

### D6. The thirteen sentences, drafted as overridable defaults

Rules applied in drafting: one sentence-pair max, ≤160 characters (the SERP
truncation ceiling, enforced by the registry guard), each drawn from the
route's own shipped H1 and copy rather than invented, calm-tone (no pressure
mechanics, no counting language, and — deliberately — not even the *denial*
vocabulary: a description that says "no streaks" would put the word into copy
the calm-tone guards read, L-079's polarity trap).

| route | draft description (default) |
|---|---|
| `/` | Your ADHD friendly self-improvement coach. Small, deliberate daily steps that fit how your brain works. *(unchanged, byte-for-byte)* |
| `/now` | One thing, right now: a calm focus timer for a single task. Start when you are ready, stop when you need to — nothing is held against you. |
| `/slicer` | Slice a big, foggy task into small concrete steps you can actually start. Built for ADHD brains that stall on "just do it". |
| `/ambient` | Steady background sound for focus: pick an ambient noise, press play, and give your brain something calm to lean on. |
| `/breathe` | A short guided breathing pause. Follow the rhythm on screen and let your nervous system settle before the next thing. |
| `/challenges` | Tiny, optional micro-challenges that build momentum in minutes. Try one when you have the energy; skip freely. |
| `/focus` | Choose today's focus and dose: one intention, sized to fit the day you are actually having. |
| `/execute` | Work through today's plan one step at a time, with a coach suggestion when you stall and a calm stop whenever you choose. |
| `/review` | A gentle end-of-day review: what worked, what felt heavy, and one small adjustment for tomorrow. |
| `/trends` | Your last four weeks at a glance: check-ins, focus sessions, and gentle patterns. Information, not judgement. |
| `/journal` | A quiet page for today. Write what is on your mind; it stays on your device unless you choose to sync it. |
| `/pricing` | One simple membership: $5/month after a 30-day free trial. No tiers, and the local app keeps working either way. |
| `/monetization` | An internal conversion-analytics snapshot for the site owner. Not part of the daily coaching loop. |

Every sentence is individually overridable in section 6. The `/journal` and
`/pricing` sentences state real shipped behaviour (local-first storage; the
lapsed-subscriber consequence the 2026-07-26 D1 decision accepted) — if either
behaviour ever changes, the sentence is part of what that change must sweep
(L-043's other-homes rule now includes the registry).

### D7. Guards extend existing suites; the L-042 obligations priced now

The artifact half extends **`src/__tests__/route-title-contract.test.ts`**
(its subject is already "the registry vs. the built static export" and it
already parses `out/<route>/index.html` for all thirteen routes); the registry
half extends **`route-registry-guard.test.ts`**. **No new `.test.ts` file
under `src/__tests__` or `src/app/__tests__`**, so the roadmap's guard-suite
count word stays **Twenty-two** and no count obligation is schedulable — the
same D8 shape v0.24 used. If the implementation chooses a new suite anyway, it
owes Twenty-two → Twenty-three plus the names-list entry **in the same PR**
(`roadmap-guard-count.test.ts` reads the disk; `NUMBER_WORDS` already carries
`"twenty-three"` and the claim regex already accepts hyphens, both since v0.25
PR1, so only the sentence itself moves).

Expectation sourcing (L-054): the export-side assertions compose expectations
from `ROUTES[i].description` and literals, **never** by calling
`metadataForRoute()` — a guard that consumed the derivation would move with
it. The registry itself is the specification; perturbing it is a spec change
no derived guard can call (see the controls in D8).

### D8. One PR, and the controls that can actually fail

v0.27 ships as **one PR** (the v0.18 precedent): the registry field, the
`metadataForRoute` widening, the root-layout pieces, both guard extensions,
then `0.27.0` with both lockfile copies, the heading flip to DONE and the
Current-state version sentence, all in the same commit (`roadmap-milestone-
status`, `roadmap-version-claim`, `lockfile-version-parity`).

*Alternative recorded:* a copy PR and a mechanism PR. Rejected: the layouts
need no edits, so there is no mechanism-only diff worth reviewing alone, and a
copy-only PR would ship registry fields nothing consumes — the
"shipped surface that silently does nothing" class.

**Controls (L-054 applied at definition time, so the implementing run does not
re-litigate it):** perturbing a registry `description` moves expectation and
observation together and is UNFALSIFIABLE — a green there is the failure
signal, never the pass. The controls that discriminate, each with both halves
quoted (L-037), implementation committed first (L-035):

- **(A) the derivation narrowed**: `metadataForRoute` returns `{ title }`
  only, registry untouched, rebuild → the export must reproduce today's
  thirteen-identical-descriptions state and the distinctness clause must red
  quoting it. This is the exact shape v0.25 PR2 reused from PR1's control B.
- **(B) one layout's fallback**: delete `export const metadata` from a single
  segment layout, rebuild → that route falls back to the root description; the
  per-route equality clause must red naming that one route while its siblings
  stay green.
- **(C) the basePath trap sprung**: resolve `og:url` against the origin
  (drop the base path), rebuild → clause 3 must red showing the URL without
  `/adhd-daily-coach/`. This is the control that proves clause 3 is not
  satisfiable by "an og:url exists" (L-033).

## 4. Why this and not the other candidates

Taken from the v0.27 product item's pre-vetted pool, with each reason at its
source: the **two-Escape-owners interaction** (PR #166) and the **`role="img"`
taste call** (PR #172) are single decisions, not milestones — they stay open
items an increment can take alongside anything. The **`src/app/**`
behaviour-coverage MED** (PR #158) and the **rendered-DOM theme-guard gap**
(PR #165) are QA-stream work with their own cadence slots; scheduling them as
the milestone would spend the product slot restating the QA queue. The
**silent-migration question** (PR #153) needs a product decision this doc's
author may not make unilaterally and remains open. **FCM push** is
console-gated (USER-ONLY). **Promoting `e2e` to required** is DevSecOps with
its own recorded evidence bar. The **surviving `background-color: --var`**
(PR #165) is blocked on the `agents/dev-agent/` boundary. Descriptions + OG
was named the strongest candidate by two consecutive definitions, blocked only
on owner copy — and drafting that copy as overridable defaults is precisely
what a review-gate definition is for.

## 5. Explicitly not in scope

- **og:image / twitter:image** — D5; owner-supplied asset, additive later.
- **twitter:* tags** — platforms fall back to OG for text-only unfurls;
  adding a parallel vocabulary with no image buys nothing today. Additive.
- **JSON-LD / structured data, sitemap.xml, robots.txt** — different
  consumers, different evidence, own proposal if ever wanted.
- **Any rendered-DOM change** — this milestone must leave `e2e/nav-shape.
  spec.ts`'s ceilings and every page byte-identical; like v0.25, it changes
  what leaves the page, not what is on it.
- **The root title and description strings** — frozen (D3); the runbook and
  `route-title-contract` both pin the title, and clause 2 pins the
  description.

## 6. Owner overrides

*(Empty until the owner weighs in. Silence ships every default above;
overriding any single sentence in D6, or any decision D1–D8, is one line
here.)*
