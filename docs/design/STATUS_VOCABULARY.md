# v0.21 - One calm status vocabulary: transient status speaks through one accessible primitive

Status: **SHIPPED 2026-08-07** (PR #152 = PR1, PR #153 = PR2), defined the same
day by the product-role increment. Every decision below was an overridable
default: the user could veto or reshape any of them with one line, and silence
shipped the defaults, per the pattern v0.15 through v0.20 followed. All of D1
through D7 shipped on their defaults, with one correction D4 made to itself
while being implemented, recorded under D4 rather than only in a PR body.

## 1. Premise, verified at source

This milestone promotes the design call the repo filed for itself when PR #123
extracted `AuthMessage`: the bug entry deliberately left the wider
consolidation open because "collapsing them means deciding whether this app
wants one generic `StatusMessage` primitive... a design call across five
surfaces rather than a rider on a two-page bug fix." This document is that
design call.

Every claim below was re-read at source on 2026-08-07 rather than inherited
from the bug entry (which is dated 2026-07-26 and predates v0.16 through
v0.20). That pass changed three of them - the `/journal` surface does not
exist, the guard-count sentence reads **Eleven** and not "Nine", and
`/execute`'s third banner is a neutral `text-slate-800` rather than another
tone shade - so the corrections are recorded inline below rather than left
for the implementing PR to trip over:

- **The near-duplicate markup is still live.** `src/app/page.tsx:735-744`
  renders the migration ok branch (`text-emerald-700`, `aria-live="polite"`)
  and the migration error branch (`text-rose-700`, `role="alert"`,
  `aria-live="assertive"`) inline - the error branch character-for-character
  the markup that became `AuthMessage`, three lines above its `<AuthMessage>`
  render.
- **Two routes swallow migration errors entirely.** `src/app/now/page.tsx:191`
  and `src/app/trends/page.tsx:143` render only the
  `migrationStatus.type === "ok"` branch. There is no error branch in either
  file (`grep -rn 'migrationStatus.type' src/app --include=*.tsx` returns
  exactly four render sites: two on `/`, one each on `/now` and `/trends`,
  the latter two both `"ok"`-only). A guest whose focus-session migration
  fails on those routes gets no text and no announcement - the same silent
  shape as the `/focus`/`/pricing` sign-in bug PR #123 fixed, on the
  migration concern.
- **The configuration notice is never announced.** `src/app/page.tsx:730`
  renders the "Google login is not configured yet" amber paragraph with no
  `role` and no `aria-live` at all.
- **`/execute` has grown a second vocabulary.** `src/app/execute/page.tsx:278-300`
  renders three status banners on the `.status-banner` class
  (`globals.css:902`), all at `-800` shades where every other surface uses
  `-700`: `checkinStatus` ok (`text-emerald-800`, polite, plus the
  `.status-celebrate` variant at `globals.css:910`), `checkinAdvice`
  (`text-slate-800`, polite), and `checkinStatus` error (`text-rose-800`,
  `role="alert"`, assertive). Two parallel tone systems for one concern.
- **No `StatusMessage` component exists anywhere.** A repo-wide
  case-insensitive grep for `StatusMessage`/`status-message` across
  `.ts`/`.tsx` finds only `statusMessageFor` in `src/lib/checkin-workflow.ts`
  and the `statusMessage` field it returns - a string-choosing helper in the
  lib layer, a different concern this milestone does not touch.
- **The one guard that exists covers only auth.**
  `src/__tests__/auth-message-contract.test.ts` fails when a `.tsx` under
  `src/app` calls `signInWithGoogle` without rendering `<AuthMessage>`. Its
  header records WHY the auth surface needs a guard ("a hook returns a value
  callers may silently drop"), and its two read sources are
  `use-coach-auth.ts` and `auth-message.tsx` - so migration and check-in
  status are outside it by construction rather than by a recorded decision,
  and nothing stops a sixth surface from spelling the paragraph inline again.
  It already scans through `src/__tests__/helpers/source-scan.ts`
  (`shippedSourceFiles`, `withoutComments`); D6's guard reuses that helper
  rather than growing a second file walk.

**One inherited claim corrected here rather than repeated.** The PR #123 bug
entry says the primitive "would also absorb the `authConfigured` amber note
and the two `migrationStatus` branches on `/journal`, `/now` and `/trends`".
`/journal` is wrong: the live grep above returns exactly four
`migrationStatus.type` render sites and none of them is in
`src/app/journal/page.tsx`, which renders only an `aria-live="polite"`
save note (`journal/page.tsx:157`, out of scope per D5). The surface count in
this milestone is therefore `/`, `/execute`, `/now`, `/trends` - four page
files plus the `AuthMessage` component, not five pages.

## 2. What v0.21 is

One `StatusMessage` component owns the markup, tone classes, and politeness
semantics for page-level transient status - the messages that appear in
response to something that just happened (a migration ran, a check-in saved,
sign-in failed, a feature is unconfigured). Every page-level call site listed
above adopts it, `/now` and `/trends` gain the error branch they are missing,
and a guard test keeps the vocabulary closed the same way
`auth-message-contract` keeps the auth surface closed.

This is UI/UX consistency plus two real accessibility fixes, squarely inside
the 2026-07-19 frontend-lead direction. No new route, no new data, no new
dependency, no Firestore surface.

## 3. Decisions (every one an overridable default)

- **D1 - The primitive.** `src/app/components/status-message.tsx` exporting
  `StatusMessage` with props `tone: "success" | "error" | "notice"`,
  `message: string | null | undefined` (null renders nothing, matching
  `AuthMessage`), optional `celebrate?: boolean` (the `/execute` variant),
  optional `data-testid` passthrough, optional `className` for spacing only.
  Politeness is DERIVED from tone, not a prop: `error` renders
  `role="alert"` + `aria-live="assertive"`; `success` and `notice` render
  `aria-live="polite"`. Callers cannot disagree about how urgent an error is -
  that is the point of the vocabulary.
- **D2 - Tone classes preserve the theme contract.** `error` uses
  `text-rose-700`, `success` `text-emerald-700`, `notice` `text-amber-700` -
  the classes `globals.css` hangs `html[data-theme="dark"]` overrides on (the
  `AuthMessage` header comment records this contract for rose; all four
  families are confirmed to carry a dark override, `globals.css:111`, `:116`,
  `:120`, `:125`). `/execute`'s `-800` shades reconcile to the shared `-700`
  vocabulary; that is a deliberate visible change on one page, recorded here
  rather than smuggled. `.status-banner`/`.status-celebrate` layout classes
  stay, passed via `className`/`celebrate`.
- **D2a - The one mapping that is a colour-FAMILY change, not a shade
  change.** Two of `/execute`'s three banners map cleanly
  (`text-emerald-800` -> `success`, `text-rose-800` -> `error`). The third,
  the "Coach suggestion" advice banner, is `text-slate-800` - a neutral, and
  `slate` is not one of the three tones. Default: it becomes `tone="notice"`
  (`text-amber-700`), which is the honest reading (advice is a notice) and is
  what closes the second vocabulary rather than leaving one banner outside
  the primitive. Alternative if the user prefers the neutral look: keep the
  advice line outside the primitive as ambient copy under D5, in which case
  `/execute` adopts two banners rather than three and the D6 guard is
  unaffected either way (the advice banner carries no `role="alert"`). This
  sub-decision is called out separately because it is the only visible change
  in the milestone that a reader could reasonably dislike.
- **D3 - `AuthMessage` becomes a thin delegate** over
  `StatusMessage tone="error"`. Its public contract (props, markup, classes)
  and `auth-message-contract.test.ts` stay byte-for-byte unchanged - the auth
  surface is behavior-preserved, and the contract test passing UNCHANGED is
  the proof.
- **D4 - `/now` and `/trends` gain the missing error branch** through the
  primitive. This is the milestone's behavior ADD: each gets a regression test
  asserting a failed migration is rendered and announced assertively, run
  against origin/main first and observed failing there (no error branch
  exists to find), red quoted in the PR body.
  **Corrected while implementing (PR #153), two ways.** (a) This clause read
  as if the gap were purely in the MARKUP. It was not: both effects also only
  ever called `setMigrationStatus({ type: "ok", ... })`, so shipping the
  render branch alone would have added a branch nothing could reach - the
  "shipped surface that silently does nothing" class this repo files as a
  defect. Both halves landed. (b) The obvious failure to inject, a rejected
  Firestore write, does NOT reach the branch: `focus-session-store.ts`'s
  firestore `migrateGuestFocusSessions` deliberately falls back to the LOCAL
  migration when the copy throws, and that fallback succeeds and reports
  `migrated`. The reachable trigger is the LOCAL write failing (a full or
  disabled `localStorage`), which is precisely the case where the sessions
  really are not where the person expects, and it is what both regression
  tests inject.
- **D5 - Scope boundary: page-level transient status only.** Out of scope,
  each for a stated reason: `reminder-settings.tsx` (form-field hints and
  per-field validation - a field-level concern with six sites of its own,
  candidate for a later slice), `/journal`'s "Saved for today" note
  (persistent state description, not a transient status), `theme-toggle`'s
  confirmation and `swipe-step-card`'s hint (widget-internal), `/focus`'s
  flow-lock note and field counter (ambient state), `AffirmationCard` (content,
  not status), `/now`'s timer `aria-live="off"` (deliberate silence). The
  guard in D6 is scoped so none of these fail it.
- **D6 - The guard.** A new suite named
  `src/app/__tests__/status-message-guard.test.ts` - the `.test.ts` extension
  and one of the two guard directories are NOT stylistic: they are what
  `roadmap-guard-count.test.ts` counts as a guard suite - failing when any
  `src/app/**/page.tsx` contains a literal `role="alert"`. Its file list is
  glob-discovered through the existing `shippedSourceFiles` helper with a
  zero-match hard failure (L-031), never hand-enumerated. Mechanical and
  allowlist-free: after PR1 migrates `/` and `/execute`, zero page files
  spell it (verified live 2026-08-07 - the only two current hits under
  `src/app/**/page.tsx` are `page.tsx:741` and `execute/page.tsx:296`; the
  other three hits in the tree are `auth-message.tsx:35`,
  `reminder-settings.tsx:253` and a comment in
  `components/__tests__/subscription-guard.test.tsx`, all outside the scoped
  glob), so errors must speak through the primitive (or a component wrapping
  it, which is where `role="alert"` stays legal). Polite notes in page files
  stay unguarded - the defect class that has bitten twice (silent or
  inconsistent ERRORS) is what the guard closes. Ships with a blindness
  control naming two page files as anchors, per the repo's control
  convention, and must be observed red against origin/main's `page.tsx`
  before the migration lands (quoted in PR1's body). Adding this suite
  obligates the ROADMAP guard-count sentence update in the SAME PR
  (`roadmap-guard-count.test.ts` contract): **Eleven becomes Twelve**, and
  the new suite must be NAMED in that sentence, not just counted. (Counted
  live 2026-08-07 by the same rule the guard uses - `.test.ts` directly under
  `src/__tests__/` or `src/app/__tests__/` - which returns eleven files today
  and matches the roadmap's current word. The first draft of this document
  said "Nine becomes Ten", inherited from an older edition of that sentence;
  it was wrong by two and is corrected here rather than shipped for PR1 to
  trip over.)
- **D7 - Two PRs, dependency-ordered.**
  - **PR1:** the primitive + its tone/politeness behavior tests; `/` adopts it
    for all four statuses (the amber configuration notice becomes
    `tone="notice"` and gains its first `aria-live="polite"`); `/execute`
    adopts it for its banners (celebrate preserved; the advice banner per
    D2a's default); `AuthMessage` delegates (D3); the guard suite (D6) +
    ROADMAP guard-count sentence Eleven -> Twelve, naming the new suite.
  - **PR2:** `/now` and `/trends` adopt it and gain the error branch (D4) with
    their failing-first regression tests; carries the `package.json` bump to
    0.21.0 and flips the roadmap heading to DONE in the same commit, per the
    `roadmap-milestone-status.test.ts` contract.

## 4. Done-when, each clause checkable by CI rather than by opinion

Per the repo's standing rule (and lesson L-033), no clause below is a bare
existence search: each is a test that fails when the behavior is absent, plus
the evidence the PR body must quote.

1. `StatusMessage`'s test proves the tone-to-politeness mapping as a behavior
   difference: `tone="error"` renders `role="alert"` + assertive, `success`
   and `notice` render polite with no `alert` role, and null message renders
   nothing. PR1's body cites the test path and the perturbation observed red
   (both halves: perturbation confirmed applied, failing line quoted).
2. The D6 guard suite is red against origin/main's unmigrated pages (quoted in
   PR1's body) and green after PR1; `roadmap-guard-count.test.ts` is green
   with the sentence naming the new suite in the same PR.
3. `/now` and `/trends` each have a test asserting a failed migration is
   rendered and announced assertively; both observed failing against
   origin/main (no error branch exists there) and quoted in PR2's body.
4. `auth-message-contract.test.ts` passes UNCHANGED in both PRs (D3's
   behavior-preservation proof).
5. Tier-1 gates green on both PRs: `npm run lint`, `npm run typecheck`,
   `npm test`, `npm run build`, plus the `e2e` and `lighthouse` jobs (the
   CLS floors must hold: status paragraphs keep their current
   appear-in-flow behavior, and any layout regression the gate catches is a
   finding, not a threshold edit).
6. `package.json` reads 0.21.0 and the v0.21 heading reads DONE only in PR2's
   merge commit.

## 5. Explicitly NOT in scope, each with its trail

- **FCM push**: still multiple USER-ONLY console gates (re-checked at the
  v0.17 definition and unchanged; nothing new observed 2026-08-07).
- **Workspace cloud sync (slicer tasks + planner state to Firestore)**: the
  real successor to v0.17's local scope-key crossover, and deliberately NOT
  chosen: it would add a THIRD Firestore rules block while the v0.9 `journal`
  block (PR #89) and the v0.12 `focusSessions` block (PR #110) both remain
  unpublished in the console, meaning the already-shipped sync features still
  fall back to localStorage in production. Deepening a pending USER-ONLY
  obligation is the wrong product move; the publish stays surfaced in the
  backlog instead.
- **Security-hardening remainder (AUTONOMOUS plan Phase 5)**: mostly already
  true, re-verified live on 2026-08-07 rather than inherited. `gh api
  repos/rodmen07/calm-daily-coach` reports `secret_scanning: enabled`,
  `secret_scanning_push_protection: enabled`, `dependabot_security_updates:
  enabled`, and `gh api
  repos/rodmen07/calm-daily-coach/private-vulnerability-reporting` returns
  `enabled: true`. All six workflows declare a `permissions:` block
  (`dev-agent-runner.yml`'s is job-level at line 21, which a top-level-only
  grep misses - noted so the next pass does not re-file it as a gap), and
  every `uses:` in `.github/workflows/` resolves to a first-party
  `actions/*`. What genuinely remains is two things, both confirmed live:
  the template `SECURITY.md`, still the GitHub boilerplate advertising
  support for versions `5.1.x`/`4.0.x` of an app whose `package.json` reads
  `0.20.0`, wording and all ("Use this section to tell people..."); and the
  dead four-secret `env:` injection on `dev-agent-runner.yml`'s
  `Configure environment` step (lines 51-58: `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GITHUB_TOKEN` handed to a step
  whose entire body is `echo "Environment configured"`). That is one
  DevSecOps cadence increment, filed as a backlog item, not a milestone.
- **The D7 second measurement divergence** (Firebase env in the measured
  build): a supply-chain decision awaiting the user, unchanged.
- **Promoting the `lighthouse` context to required**: keeps its own clearing
  condition (2026-08-01 backlog item).
- **`/journal/` and `/trends/` joining the Web Vitals gate**: stays in the
  follow-up queue per v0.20's recorded cost reasoning.
- **Field-level and widget-internal messages** (D5's excluded list): a later
  slice if the vocabulary earns it.

## 6. User decisions recorded by this document

None yet. Every D above ships on its default unless the user objects; this
section gains a dated block if and when the user weighs in, matching the
convention `docs/design/PERF_PASS.md` section 2 uses.
