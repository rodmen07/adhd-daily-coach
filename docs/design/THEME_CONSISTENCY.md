# Theme Consistency Pass Design (v0.10)

Status: PROPOSED - default decision, agent-doable now. Not a hard review gate
like [REMINDER_SCHEDULING.md](REMINDER_SCHEDULING.md): every choice below is
an overridable default, so the user can accept the lot with one word or
redirect any single line. Written 2026-07-20 as part of a roadmap-audit /
product increment, the same slot [JOURNAL_FIRESTORE_SYNC.md](JOURNAL_FIRESTORE_SYNC.md)
was written in for v0.9.

## 0. Why this document exists

v0.9 (gratitude journal Firestore sync) shipped and was hardened across PRs
#88, #89, and #90. The backlog's "Later / candidates" list carries several
unscheduled ideas - a performance pass, a Playwright E2E suite, a SECURITY.md
replacement, removing dead `mailer.ts` - none of which, as currently worded,
are milestone-shaped without further scoping (see section 1 for why each was
set aside). Rather than pick the vaguest of those and call it "polish," this
document audits the app's ACTUAL theming architecture against every route's
real component code and defines v0.10 around a concrete, currently-shipped
gap it found.

## 1. Candidates considered

Four candidates were on the table, matching the four the dispatch prompt
named:

1. **Performance pass** (bundle size, load time): checked before ruling it
   in or out, rather than assumed. This repo has `output: "export"`
   (`next.config.ts`) with `images: { unoptimized: true }` (required for a
   static export - Next's Image Optimization API needs a server), no
   `@next/bundle-analyzer` dependency, no web-vitals reporting wired up
   anywhere, and no committed baseline measurement of any kind. Concretely
   scoping "performance" as a milestone would require adding baseline
   instrumentation FIRST, so a done-when could state an improvement over a
   number that exists - there is nothing to regress against yet. That
   instrumentation step is itself reasonable future work (a strong v0.11
   candidate), but committing to "faster" as v0.10's done-when today would
   not be checkable by CI without it. Set aside for now, not deleted.
2. **General visual/interaction polish**: too vague on its own, exactly as
   the prior product-role document already found for what became v0.9's
   predecessor. It only becomes real work once it names a concrete surface,
   which is what candidate 4 below does.
3. **Playwright E2E test infrastructure**: genuinely raises the bar (a
   regression net for the daily loop across real browser rendering), but its
   value is "make the test suite trustworthy," which is what the QA stream
   exists to own, not new user-facing capability, which is what a
   product-defined dev milestone should be. It already sits in the backlog's
   "Later / candidates" as a QA-shaped item and keeps its own cadence slot
   there; this document does not claim it or reserve a version number for it.
4. **Theme consistency: close the shipped light/dark rendering gaps and add
   a regression guard (this document).** Found by reading
   [globals.css](../../src/app/globals.css) and
   [theme-toggle.tsx](../../src/app/components/theme-toggle.tsx) against
   every route's real markup, not by assuming a gap exists. See section 2 for
   the audit and section 3 for the fix.

**Decision: promote candidate 4 to v0.10.** It is the only one of the four
that is both milestone-sized and backed by named, line-numbered, currently
real defects rather than a hypothetical or a prerequisite step.

**Overridable default:** if the user would rather see the performance
baseline land first, or reprioritize the Playwright suite ahead of this, that
is a one-word redirect; nothing here presumes theme work is more urgent, only
that it is the most concrete and immediately actionable of the four.

## 2. What's actually there today (the audit)

**The mechanism, and where it's sound.** Theme state lives in
`document.documentElement.dataset.theme` (`"dark"` is the default, `"light"`
is opt-in via `ThemeToggle`, persisted to `localStorage` under
`calm-daily-coach:theme`). `globals.css`'s `:root` block and its
`html[data-theme="light"]` override redefine a set of CSS custom properties
(`--background`, `--foreground`, `--panel`, `--field`, `--line`, `--accent`,
`--muted`, `--surface-strong`, plus success/warning/danger surface-and-strong
pairs). Most components consume these via Tailwind v4's CSS-variable
shorthand (`bg-(--panel)`, `text-(--muted)`, `border-(--line)`), which is
theme-safe by construction: the variable itself changes per theme, not the
class name.

> **CORRECTED 2026-08-08 (QA increment).** This paragraph previously read
> "consume these **correctly** via Tailwind v4's arbitrary-value syntax
> (<code>bg-&#91;--panel&#93;</code>, <code>text-&#91;--muted&#93;</code>,
> `border-(--line)`)" — it named the **Tailwind v3 bracket form** and called
> it correct and theme-safe. It is neither under Tailwind v4:
> <code>bg-&#91;--panel&#93;</code> compiles to `background-color: --panel`,
> a bare dashed-ident where a `<color>` is required, so the declaration is
> invalid and a conforming parser drops it — the element is painted by
> nothing, and `border-color` in particular then falls back to its initial
> value `currentColor`. Only `X-(--token)` (or the explicit
> `X-[var(--token)]`) compiles to `var(--token)`. 258 occurrences of the
> bracket form had shipped across 12 source files, including sections 3 and 4
> of this very document, which prescribed it as the fix for a DIFFERENT
> invisible-rendering bug. All of them were rewritten in the same increment,
> and `src/app/__tests__/css-var-syntax-guard.test.ts` now fails the required
> gate if the form returns to `src/`. Prose is deliberately NOT guarded: a
> doc has to be able to name the wrong form in order to teach it, which is
> what this note and `agents/dev-agent/PROJECT_MEMORY.md:11` both do. That
> dev-agent memory line had recorded the rule correctly all along — it was
> written down and ungated, which is exactly why this still shipped.

**Where it isn't.** A second, narrower mechanism exists for a small,
hand-maintained list of literal Tailwind color classes, at
`globals.css:103-126`:

```
html[data-theme="dark"] .text-slate-600,
html[data-theme="dark"] .text-slate-700,
html[data-theme="dark"] .text-slate-800,
html[data-theme="dark"] .text-slate-900 { color: var(--muted-strong); }
html[data-theme="dark"] .text-amber-700 { color: var(--warning-strong); }
html[data-theme="dark"] .text-rose-700, html[data-theme="dark"] .text-rose-800 { color: var(--danger-strong); }
html[data-theme="dark"] .text-emerald-700, html[data-theme="dark"] .text-emerald-800 { color: var(--success-strong); }
html[data-theme="dark"] .border-slate-200 { border-color: var(--line); }
```

This patches only those exact classes, and only when `data-theme="dark"` is
active. Anything using a literal color class outside this list gets zero
theme adaptation in either direction.

**How big the gap is.** 73 raw
`(bg|text|border|hover:bg)-(slate|gray|zinc|neutral|stone)-(700|800|900|950)`
occurrences exist across 14 non-test files: `ambient/page.tsx`,
`breathe/page.tsx`, `challenges/page.tsx`, `execute/page.tsx`,
`focus/page.tsx`, `journal/page.tsx`, `monetization/page.tsx`, `page.tsx`
(dashboard), `pricing/page.tsx`, `review/page.tsx`, `slicer/page.tsx`,
`components/AffirmationCard.tsx`, `components/reminder-settings.tsx`,
`components/subscription-guard.tsx`, `components/swipe-step-card.tsx`. Most
of these (the plain `text-slate-700/800/900` family) ARE covered by the
override list above and render correctly in both themes today - but only
implicitly, with no guard: a future page using `text-slate-500` or
`text-gray-800` (either one step outside the covered list) would silently
ship broken in one theme, which is exactly the "a class that does not exist
renders an invisible card, which has shipped here before" failure class this
project's own design bar warns about.

**Three occurrences are already broken today, confirmed by reading the
resolved hex values, not hypothetical:**

1. `hover:bg-slate-800` on three "back to dashboard" nav buttons
   (`ambient/page.tsx:88`, `breathe/page.tsx:79` and `:123`,
   `challenges/page.tsx:81`). In dark mode this is fine: a dark hover
   background under `text-(--foreground)` (`#e8edf6`, light) reads clearly.
   In light mode, `--foreground` resolves to `#1c2333` (near-black) while the
   hover background stays the same unpatched `slate-800` (`#1e293b`, also
   near-black) - dark text on a dark hover background, invisible or
   near-invisible on hover the moment a user switches to light mode. The
   override system at `globals.css:103-126` never touches `hover:` variants
   or background utilities, so nothing patches this today.
2. `src/app/components/subscription-guard.tsx`: the trial-ended / paywall
   screen (`bg-slate-900 text-white`, `bg-slate-950`, `border-slate-800`,
   `bg-slate-900/50`, `text-slate-950`, `text-slate-400`) has zero theme
   awareness anywhere in it - it always renders as a fixed dark card
   regardless of the user's chosen theme, and is the single largest
   concentration of hardcoded literals in the app. (The v0.8 report already
   flagged this component for a manual eyeball on its reduced-motion spinner
   behavior; this audit is the first to name the separate theming gap.)
3. `src/app/focus/page.tsx:193`: a "Coach brief" callout hardcodes
   `bg-white/70`, nested inside an otherwise token-driven `bg-(--field)`
   parent card - a bright translucent white box floating inside what should
   be a dark-themed panel in dark mode.

`bg-black/40` in `slicer/page.tsx:239` was checked and set aside: it is a
modal backdrop dimming overlay, which is conventionally theme-agnostic by
design (dimming behind a modal reads correctly in both themes), not a defect.

## 3. Technical plan

- **Fix 1:** replace the three `hover:bg-slate-800` occurrences with a
  theme-aware token. **Default:** `hover:bg-(--panel)` (already the next
  panel-level surface color one step darker/lighter than
  `bg-(--surface-strong)`, the base these buttons already use one class
  earlier in the same string). **Overridable:** the implementer may pick a
  different existing token (or `hover:brightness-90` / `hover:opacity-80`) if
  it reads better against both themes' actual hex values at implementation
  time; the requirement is theme-awareness, not this specific token.
- **Fix 2 (the one genuine product call in this document, not just an
  engineering fix):** `subscription-guard.tsx`'s fixed-dark treatment.
  **Default:** make it theme-aware, swapping the hardcoded slate/white
  literals for the same `--background` / `--panel` / `--foreground` /
  `--muted` tokens the rest of the app already uses, so a light-mode user
  sees a light-themed paywall screen instead of a jarring dark modal
  mid-session. **Overridable alternative:** some products deliberately keep
  billing/paywall screens fixed-dark as a distinct "serious" visual
  treatment; if the user prefers that, the guard test below allowlists this
  file explicitly with a one-line code comment recording the decision,
  rather than silently exempting it. Either resolution is a valid close for
  this item - the point is that it becomes a recorded decision instead of an
  unexamined default.
- **Fix 3:** replace `focus/page.tsx`'s `bg-white/70` with a theme token
  consistent with its parent (default: `bg-(--field)/80` or equivalent).
- **The regression guard (what makes this a milestone, not a one-off
  cleanup):** add a new test that reads two live sources and fails when they
  disagree, the same shape as `journal-store.test.ts`'s
  local/firestore/fallback coverage and the drift-guard pattern used
  elsewhere in this system:
  - **Source A:** every literal
    `(bg|text|border|hover:bg|hover:text|hover:border)-(slate|gray|zinc|neutral|stone)-(500-950)`
    and bare `bg-white` / `text-white` / `bg-black` / `text-black` class
    usage across `src/app/**/*.tsx` (excluding `__tests__`).
  - **Source B:** `globals.css`'s override list (the exact classes at lines
    103-126) plus a small, explicit "intentionally theme-fixed" allowlist
    (populated by Fix 2's outcome if the user chooses the fixed-dark
    alternative, and by the accepted modal-backdrop exception from section 2).
  - **Assertion:** every occurrence in Source A is covered by Source B,
    either via the CSS override list or an explicit `dark:` pair in the same
    class string. A new literal outside both fails CI instead of shipping
    silently broken in one theme.

    **Correction (post-merge review, 2026-07-20): this `dark:`-pair
    exemption is unsound for this app and was correctly never
    implemented.** This project's Tailwind `dark:` variant is the library
    default - it tracks the OS-level `prefers-color-scheme` media query.
    Confirmed by absence: no `@custom-variant dark` remap exists in
    `globals.css` or `postcss.config.mjs`, and there is no
    `tailwind.config.{js,ts}` setting a `darkMode` strategy either. This
    app's actual light/dark toggle (`ThemeToggle`) instead sets
    `html[data-theme]`, a separate, independent signal - a user can have the
    app in light mode while their OS is set to dark, or the reverse. A
    `dark:foo-500` class pairing therefore proves nothing about whether
    `foo-500` is safe under this app's real toggle, and treating it as
    Source B coverage would let a genuinely broken class through. The
    shipped `theme-token-guard.test.ts` never implemented this bullet - do
    not add it. Every `dark:`-paired literal in the tree today already
    clears the CSS-override or `BASELINE_DEBT` mechanisms on its own
    merits, and a dedicated test in that file proves a hypothetical new
    `dark:`-paired class would still be flagged, not exempted.
  - **Verify the guard actually guards** before merging: temporarily revert
    one of Fixes 1-3, confirm the new test fails, then restore the fix and
    confirm it passes again - the same "prove the behavior difference"
    standard this system already holds CI gates to.
- **Explicitly out of scope for v0.10** (keeps this sized like v0.9's
  single-PR pattern): migrating every already-covered `text-slate-700`-style
  literal over to the `--token` system wholesale. The override mechanism
  already renders these correctly in both themes today; migrating them is a
  nice-to-have consistency cleanup, not a currently-broken surface, and
  attempting it here would blow past the "small, well-scoped" sizing
  convention. Named here as a real follow-up rather than silently dropped.

## 4. Why this doesn't need a user decision to start

Every fix in section 3 corrects a rendering DEFECT against the app's own
already-established design system (the CSS custom-property tokens most of
the app already uses correctly), not a new design direction requiring
approval. The one genuine product call - `subscription-guard.tsx`'s
fixed-dark-vs-theme-aware treatment - is flagged with an explicit default
(theme-aware) and does not block starting the rest of the work; either
resolution satisfies the done-when below.

## 5. Done-when (checkable)

- [ ] The three `hover:bg-slate-800` occurrences (`ambient/page.tsx`,
      `breathe/page.tsx` x2, `challenges/page.tsx`) use a theme-aware token
      instead of a literal.
- [ ] `subscription-guard.tsx` either uses the app's `--background` /
      `--panel` / `--foreground` / `--muted` tokens, or is explicitly
      allowlisted with a one-line comment recording the deliberate
      fixed-dark decision (section 3, Fix 2) - either resolution satisfies
      this line; the guard test enforces that a decision was made, not which
      one.
- [ ] `focus/page.tsx`'s `bg-white/70` callout uses a theme-aware token.
- [ ] A new automated test scans `src/app/**/*.tsx` for literal risky-family
      color classes and fails on any occurrence not covered by
      `globals.css`'s documented override list or an explicit
      `dark:`-paired/allowlisted exception; verified to actually FAIL against
      the pre-fix state (temporarily reverting one of the three fixes and
      confirming the new test catches it) before merge.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` are
      green in CI (the same required `lint-and-build` quality-gate check PR
      #86 consolidated).
- [ ] `package.json` is bumped to `0.10.0` **in the implementation PR**, not
      in this proposal PR, matching the v0.9 precedent.

## 6. Disposition of candidates set aside

- **Performance pass:** stays in "Later / candidates," now with the concrete
  note that a baseline (bundle analyzer or web-vitals instrumentation) would
  need to ship first before a numeric done-when is possible. Good candidate
  for v0.11 or whenever the frontend mandate calls for it next; not deleted,
  not demoted, just not yet in a CI-checkable shape.
- **Playwright E2E test infrastructure + PR template:** stays in "Later /
  candidates" as a QA-stream item. Not reassigned a version number by this
  document; the QA stream keeps its own cadence slot and can claim it
  whenever it reaches the top of that queue.
- **SECURITY.md replacement, dead `mailer.ts` removal:** unaffected by this
  document, still small maintenance items, still in "Later / candidates."
