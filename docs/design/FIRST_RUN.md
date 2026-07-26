# v0.15 - First run: the front door a stranger actually meets

Status: **IN PROGRESS 2026-07-26** (product-role increment, written after v0.14
shipped: PR #117 + PR #118 + PR #121). **PR1 shipped as PR #123**; PR2 (the hydration
gate, D5) is what remains before this milestone is DONE and `package.json` moves
to 0.15.0. Section 5 records which boxes PR1 ticked.

Every decision in section 3 is an **overridable default**. The user is the
product owner; this document brings the decision rather than making it. Saying
"go" accepts the lot.

---

## 1. What is true today (verified, not recalled)

Every fact below was checked against the source tree at `00a813d` and against
the live deployment on 2026-07-26. Nothing here is copied from a changelog.

**v0.14 opened a door nobody has walked through yet.** Until PR #121 merged
earlier today, `subscription-guard.tsx` answered `!authUser` with a full-screen
"Sign in required" wall and `layout.tsx` wrapped every route in it, so *no
signed-out visitor has ever seen any page of this app*. Confirmed live:

```
curl -sL https://rodmen07.github.io/calm-daily-coach/ -> HTTP 200
grep -c "Sign in required"      -> 0   (the wall is gone from the deploy)
grep -c "Personalize your coach" -> 0   (the onboarding overlay is NOT prerendered)
grep -c "GUEST (LOCAL)"          -> 0   (the guest badge is NOT prerendered)
```

That is the point of this milestone: the first-run path is now reachable for
the first time, and it has never been exercised as a real product path. Three
defects filed in the last two days all sit on exactly it, each found while
doing something else.

**Fact A - three sign-in surfaces, one of which tells the truth.**
`useCoachAuth` is a plain hook, not a context (`src/app/hooks/use-coach-auth.ts:20`
holds `authMessage` in `useState`, returned at `:124-129`), so every component
that calls it owns a private copy of the failure message. Exactly three routes
call `signInWithGoogle`:

| Route | Call site | Renders `authMessage`? |
|---|---|---|
| `/` | `src/app/page.tsx:624`, `:673` | **yes**, `:684` in a `role="alert" aria-live="assertive"` paragraph |
| `/focus` | `src/app/focus/page.tsx:60` | **no** - `:17` destructures `authUser`/`signInWithGoogle`/`signOutUser` only |
| `/pricing` | `src/app/pricing/page.tsx:85` | **no** - `:9` destructures `authUser`/`signInWithGoogle` only |

Repro: `grep -rn "authMessage" src/app --include=*.tsx | grep -v __tests__`
returns hits in `page.tsx` and nowhere else. So a sign-in failure that does not
self-recover through the redirect fallback
(`shouldFallbackToRedirect`, `src/lib/firebase-auth-errors.ts:8`, applied at
`use-coach-auth.ts:95`) produces, on those two pages, *nothing at all*: no text,
no announcement. `/pricing` is the checkout entry point, which is the same
revenue-path shape PR #117 closed one day ago.

**Fact B - `/focus` is the only route with no test.** Thirteen `page.tsx` files
exist under `src/app`; `src/app/__tests__/` covers twelve of them. There is no
`focus-page.test.tsx`. That is the page carrying one of the two silent
sign-in buttons.

**Fact C - the onboarding gate is not hydration-safe, and only a first-time
visitor is affected.** `src/app/page.tsx:138` reads
`useState(() => getOnboardingPreferences() === null)`. Under `output: "export"`
the prerender has no `window`, so the static HTML never contains the onboarding
block (verified by the `curl` above). A **returning** visitor computes `false`
on the client and matches. A **first-time** visitor computes `true` and renders
the overlay during hydration, which is a mismatch. The render guard at `:376`
(`showOnboarding && typeof window !== "undefined"`) does not help: the
initializer has already run. The same file already documents the correct
pattern one screen up, in `AnimatedCounter` (`:56-65`): keep the initial value
hydration-safe and settle it in an effect.

Everyone who has ever used this app is a returning visitor, because there was no
way to arrive as anything else. v0.14 is what makes Fact C reachable.

---

## 2. Why this milestone, over the alternatives

The dev queue is empty (`package.json` reads 0.14.0, and before this document
`docs/ROADMAP.md` ended at v0.14 marked DONE). The candidates on the table, and
why each was passed over:

- **Reminder reach via FCM push.** Still carries service-worker plus console
  VAPID-key setup, so it is USER-ONLY gated before any code is exercisable.
  Unchanged since v0.11 scoping.
- **Performance pass.** Still no web-vitals baseline, so "faster" is not
  checkable by CI. This needs an instrumentation milestone in front of it;
  worth defining, but it is a bigger unit than this one and buys nothing a
  visitor notices yet.
- **Playwright E2E.** The objection recorded in PR #116 ("a suite written now
  would encode the behavior v0.14 changes") **expired when v0.14 shipped**, so
  this is genuinely eligible again and is the strongest runner-up. It is
  declined here for two reasons rather than by habit: it is QA-stream work, and
  a browser suite added now would encode the first-run path *as it currently
  behaves*, hydration warning and silent sign-in included. Fix the path, then
  pin it. Recommended as the milestone after this one.
- **Extending guest migration to planner state and slicer task history.**
  v0.13 D7 scoped both out as ephemeral, and the primitive is cheap to reuse.
  Still true, still cheap, and now unblocked by the open front door. It loses
  to this milestone only on ordering: it deepens what a guest keeps, while this
  fixes what a guest *meets*.

This milestone wins because it is the only one whose scope was created by the
last one. It closes one MED and one LOW already filed, gives the last untested
route its first test, and every item in it is checkable by `npm run
test:coverage` with no new env var, no new Firestore collection, no new
security rule, and no console gate.

---

## 3. Decisions (each an overridable default)

**D1 - Is "first run" the right theme for v0.15?**
*Default: YES.* v0.14 made a path reachable that has never been walked; the
defects on it were found incidentally rather than by looking. Fix the path
before building more behind it.
*Alternative:* take the guest-migration extension (planner + slicer) as v0.15
and defer this. Reasonable if the priority is what a guest *keeps* over what a
guest *sees*; both are small, and the order is the only real question.

**D2 - How do the three sign-in surfaces agree?**
*Default: a shared presentational component* (working name
`src/app/components/auth-message.tsx`) that takes the message as a prop and
renders the existing `role="alert" aria-live="assertive"` paragraph. `/` swaps
its inline copy for it; `/focus` and `/pricing` render it for the first time.
*Alternative A (a context):* promote `useCoachAuth` to a provider so one
component's failure is visible app-wide. Rejected as the default because it is
a strictly larger change (a provider in `layout.tsx`, a new hydration surface)
and the observed defect is "nothing renders", not "state is not shared".
*Alternative B (copy the JSX twice):* rejected. Three near-identical alert
paragraphs is how the fourth surface silently ships without one.

**D3 - Is the pairing enforced mechanically?**
*Default: YES.* A guard test asserts that every `.tsx` under `src/app` calling
`signInWithGoogle` also renders the shared alert. This repo has four guards of
exactly this shape already (`theme-token-guard`, `static-export-surface`,
`workflow-audit-parity`, `roadmap-milestone-status`), each written after a
defect recurred. This one is written after the *first* occurrence, on the
argument that a hook returning a value callers may silently drop is a shape
that recurs by construction.
*Alternative:* skip the guard and rely on review. Cheaper by ~40 lines, and
gives up the only thing that stops a fourth page repeating it.

**D4 - Does `/focus` get its first test in this milestone?**
*Default: YES,* in the same PR that edits it. It is the last route without one,
and the edit is on the surface the test would cover.

**D5 - How is the hydration gate fixed?**
*Default: the pattern already in the same file* - start `showOnboarding` at a
hydration-safe `false`, settle it in an effect after mount, exactly as
`AnimatedCounter` does at `page.tsx:56-65`.
*Alternative:* `useSyncExternalStore` with a server snapshot. Cleaner in theory,
but it introduces a second pattern for the same problem in one file.
*Accepted consequence of the default:* a first-time visitor sees one frame of
dashboard before the overlay appears. That is strictly better than today's
mismatch, and it is what the counters already do.

**D6 - Does anything new get sold, nudged, or announced to a guest?**
*Default: NO.* No banner, no modal, no "sign in to keep your data" interstitial,
no countdown. v0.14's D3 (no new sign-in surface) still holds. This milestone
only makes existing surfaces honest.
*Alternative:* a single calm line stating where a guest's data lives. Defensible
and consistent with the `GUEST (LOCAL)` badge, but it is new copy on a page that
already carries the badge, so it is left out of the default rather than argued
into it.

**D7 - What is explicitly NOT in scope.**
The LOW "no single test walks guest-writes-then-signs-in through the gate in one
render" (filed by PR #121) stays QA-stream work: it needs the signed-in
Firestore path mocked into a page-level render, which is a different unit from
anything here. FCM, the performance pass, Playwright, and the planner/slicer
migration extension all stay on the candidate list.

---

## 4. Plan

Two PRs, ordered by dependency only (no calendar sizing).

**PR1 - one sign-in surface that tells the truth.**
Extract the alert paragraph from `src/app/page.tsx:684` into the shared
component (D2), render it on `/focus` and `/pricing`, add the guard test (D3),
and give `/focus` its first page test (D4). Closes the MED bug.

**PR2 - a first render that matches what was prerendered.**
Move the onboarding read out of the `useState` initializer (D5) and add the
test that pins it. Closes the LOW bug. **This PR carries the `package.json`
bump to 0.15.0** and flips this milestone's roadmap heading to DONE in the same
commit, because `src/__tests__/roadmap-milestone-status.test.ts` fails if the
shipped version reaches a milestone whose heading is not terminal. That
constraint is not new; it is the one v0.14 recorded in `docs/ROADMAP.md` after
verifying it (1 failed / 3 passed).

Either PR is independently shippable and neither blocks the other; PR1 goes
first because it closes the higher-severity bug.

---

## 5. Done when (checkable)

- [x] **PR1.** A test asserts `/focus` renders the sign-in failure message in a
      `role="alert"` region when `useCoachAuth` reports one (new
      `src/app/__tests__/focus-page.test.tsx`).
- [x] **PR1.** The same assertion exists for `/pricing` (in the existing
      `src/app/__tests__/pricing-page.test.tsx`) and still passes for `/`
      (existing `src/app/__tests__/page.test.tsx` coverage, unchanged - and it
      is now the proof that `/` really consumes the shared component, since it
      fails when that component regresses).
- [x] **PR1.** A guard test fails when a `.tsx` under `src/app` calls
      `signInWithGoogle` without rendering the shared alert, proven by
      sabotage (delete one page's alert; exactly that assertion fails and the
      others stay green) - `src/__tests__/auth-message-contract.test.ts`.
- [ ] A test asserts the first client render for a first-time visitor contains
      no onboarding overlay, and that the overlay appears after effects flush,
      proven by reverting the fix.
- [x] **PR1.** `/focus` is no longer the only route without a page test:
      `find src/app -name page.tsx` and `ls src/app/__tests__` agree.
- [ ] `package.json` reads 0.15.0 and this milestone's `### v0.15` heading in
      `docs/ROADMAP.md` reads DONE, in the same commit (see section 4).
- [ ] The five CI-pinned gate commands from `.github/workflows/ci.yml`
      (lines 39/42/45/48/54) are green: `npm run lint`, `npm run typecheck`,
      `npm run build`, `npm audit --audit-level=high`,
      `npm run test:coverage`.

---

## 6. Product rules

No streaks, no infinite feed, no pressure mechanics, calm ADHD-friendly tone.
This milestone adds no nag, no countdown, and no "you are missing out" copy
(D6). The one piece of copy it adds is a failure message that already exists in
the codebase and is currently shown to nobody. Its tone is inherited, not
invented.

Accessibility is part of done, not a follow-up: the shared alert keeps the
`role="alert" aria-live="assertive"` semantics `/` already has, so the two pages
that gain it gain the announcement too, not just the text.

---

## 7. Risks

- **The guard test over-fires.** A future page might legitimately call
  `signInWithGoogle` from a component that renders the alert elsewhere in its
  tree. Mitigation: scope the guard to "the file that calls it also imports the
  shared component", which is what the three existing guards do, and let a
  genuine exception be an explicit allowlist entry with a reason.
- **The hydration fix changes what the first frame looks like.** Accepted under
  D5 and stated there.
- **Nothing here is visible to a returning user.** True, and it is the point:
  every existing user of this app is a returning user, and the population this
  milestone serves is everyone who has not arrived yet.
