# v0.14 - Let people in: guest access and a reachable checkout

Status: DESIGN, awaiting user sign-off on D1. Written 2026-07-25 as the
product-role increment after v0.13 shipped (PR #113 + PR #115).

Every decision in section 3 is an **overridable default**. The user is the
product owner; this document brings the decision rather than making it. If the
defaults are acceptable, one word accepts the lot; any single D-item can be
flipped without redesigning the rest.

---

## 1. What is true today (verified, not recalled)

Facts below were checked against the source and the live deployment during this
increment, not read off a changelog.

**The gate.** `src/app/components/subscription-guard.tsx` wraps every route via
`src/app/layout.tsx:79`. Its first branch (`:85-86`) is:

```tsx
// REQUIRE Google login (remove guest mode)
if (!authUser) { ...full-screen "Sign in required" wall... }
```

There is no route awareness anywhere in it: `grep -rn "usePathname" src/`
returns hits in `site-nav.tsx` and its test only, never in the guard or the
layout. So the gate makes exactly one decision for all thirteen pages.

**The live site really is gated.** The deployed build is Firebase-configured -
all six `NEXT_PUBLIC_FIREBASE_*` secrets exist on the repo, and the shipped
chunk set fetched from https://rodmen07.github.io/calm-daily-coach/ contains a
baked `firebaseapp.com` auth domain (presence checked, value not printed). So
`authConfigured` is true in production and a visitor gets the real wall with a
working Google button, not the "not configured yet" branch. The wall is the
product's actual front door.

**Everything else in the app is built as if guests existed.**

- `resolveCheckinBackend` resolves to localStorage when signed out, and the
  journal, focus-session, and check-in stores all have a local backend that is
  fully implemented and tested.
- `sync-status-badge.tsx:24,71` renders `GUEST (LOCAL)` and `LOCAL WORKSPACE`
  states. The badge sits in the header, one DOM level ABOVE the guard
  (`layout.tsx`), so a signed-out visitor is shown "GUEST (LOCAL)" and
  "Sign in required" on the same screen.
- **v0.13, shipped today, migrates data a person creates while signed out** -
  journal entries (PR #113) and focus sessions (PR #115). On the deployed
  build that data cannot be created, so the milestone's user-visible value is
  currently unreachable. This is the sharpest evidence that the gate and the
  product have drifted apart: two consecutive dev increments built for a person
  the front door turns away.
- **Three sign-in buttons already exist inside the app** and no signed-out
  visitor has ever seen any of them: `src/app/page.tsx:618` and `:667`,
  `src/app/focus/page.tsx:60`, plus `src/app/pricing/page.tsx:85`. The
  invitation-shaped version of sign-in is already built; the wall preempts it.

**The checkout dead end.** The trial-ended screen (`subscription-guard.tsx:155-188`)
offers exactly one action, `<Link href="/pricing">Subscribe for $5/month</Link>`,
and `/pricing` is `children` like every other route. An expired-trial account
clicks Subscribe and lands on the same "Your Trial Has Ended" screen. This half
is wrong under every reading of the guest question: a checkout page behind its
own paywall is never intended.

**Coverage.** PR #114 gave the guard its first tests (13 in
`src/app/components/__tests__/subscription-guard.test.tsx`). Four of them
currently *document* the defects rather than assert desired behavior, by
design; this milestone is what flips them.

Filed bugs this milestone closes (all from PR #114, all in the backlog's
`## Bugs`): HIGH no guest mode, HIGH paywall CTA behind the paywall, MED dead
`"expired"` status, LOW `getTrialDaysRemaining` returns NaN for a malformed
date.

---

## 2. Why this milestone, over the alternatives

| Candidate | Verdict |
| --- | --- |
| **Guest access + reachable checkout (this)** | Closes two HIGH bugs, makes v0.13's shipped work reachable, frontend-only, no console gate, every outcome checkable by test. |
| Reminder reach via FCM push | Still carries service-worker + console VAPID/FCM setup, i.e. multiple USER-ONLY gates before any code is exercisable. Unchanged since v0.11 scoping. |
| Performance pass | Still no web-vitals or bundle baseline, so "faster" is not CI-checkable; needs an instrumentation milestone first. |
| Playwright E2E smoke test | Real value, but it is QA-stream work, and an E2E suite written against the current wall would encode the behavior this milestone changes. Better *after*. |
| `mailer.ts` dead-code removal | Hygiene, not a user-visible milestone. |
| Extend migration to planner state / slicer history (v0.13 D7) | Cheap now that the primitive exists, but it extends a feature that the front door currently makes unreachable. Ordering matters: open the door first. |

The ordering argument is the whole case: three of the last four dev increments
built for signed-out people who cannot get in.

---

## 3. Decisions (each an overridable default)

**D1 - Does a signed-out person get the app?**
*Default: YES.* Remove the `!authUser` wall. The app is local-first by
construction, so a guest gets a working product whose data lives in their
browser, and signing in becomes an upgrade (sync across devices, backup),
advertised by the affordances that already exist on `/`, `/focus`, and
`/pricing`.
*Alternative A (keep the wall):* legitimate, but then it must be paid for
honestly - v0.13's guest migration, the `GUEST (LOCAL)` badge states, and the
local backends become dead code, and a follow-up milestone should delete them
rather than leave the contradiction standing.
*Alternative B (partial):* gate only the surfaces the membership sells. Not
recommended yet: nothing is sold per-surface today, so the allowlist would be
invented rather than derived.

**D2 - Is `/pricing` exempt from the gate?**
*Default: YES, unconditionally,* independent of D1. This is the one change that
is correct under every reading, so it ships FIRST and alone (PR1).

**D3 - Where does sign-in live once the wall is gone?**
*Default: nowhere new.* The three existing in-page buttons become reachable and
that is the whole change. No new banner, no modal, no interstitial - adding a
nag surface would trade one wall for a softer one, against the product rules.

**D4 - What does the paywall still block?**
*Default: unchanged for signed-in accounts* - a signed-in account whose trial
has finished and who is not subscribed still gets the trial-ended screen, now
with a working Subscribe link. Note the honest consequence of D1: such a person
can sign out and keep using the local app. That is the correct shape for a
local-first product - the membership sells sync and backup, not the ability to
run a timer - but it is a real product call, so it is flagged rather than
buried.

**D5 - The dead `"expired"` status (MED bug).**
*Default: make it blocking.* `subscriptionStatus === "expired"` should block
regardless of trial arithmetic, otherwise a future Stripe webhook writing
"expired" on a cancellation has no effect for any account younger than 30 days.
Risk is low today because nothing writes that value yet (v0.5 is
deprioritized), which is exactly why now is the cheap moment to fix it.

**D6 - The NaN trial bug (LOW).**
*Default: fix the docstring and delete the unreachable `catch`, do NOT change
the return value.* `getTrialDaysRemaining("nope")` returns NaN, and NaN happens
to fail OPEN (`daysLeft <= 0` is false), matching the guard's stated intent.
Returning 0 would mean "trial finished" and would start locking out every
account with a corrupt date - the fix that looks safer is the dangerous one.
Any caller that renders a day count must guard it.

**D7 - The four documenting tests.**
*Default: flip them to assert the new behavior in the same PR that changes it,*
and keep a regression test for each closed bug (a guest reaches a page; a
blocked account reaches `/pricing`; an `"expired"` account is blocked).

---

## 4. Plan

**PR1 - the unambiguous half.** Exempt `/pricing` from the gate (route-aware
via `usePathname`, the mechanism `site-nav.tsx` already uses), so the trial
-ended screen's only CTA leads somewhere. Closes the HIGH checkout dead-end
independent of D1.

> **Corrected while implementing PR1 (2026-07-25).** This section originally
> said PR1 bumps package.json to 0.14.0. It cannot: the drift guard added in the
> same PR that wrote this plan (`src/__tests__/roadmap-milestone-status.test.ts`,
> PR #116) fails when a milestone at or below the shipped version has no
> terminal status, so `0.14.0` plus a v0.14 section reading "(agent-doable now)"
> is a red gate - confirmed by running it (1 failed / 3 passed, the failure
> naming the v0.14 heading). The bump therefore lands in **PR2**, the PR that
> completes the milestone, matching the roadmap's own "one bump per shipped
> feature milestone" convention. Neither alternative was acceptable: a DONE
> header while PR2 is unwritten is false, and widening the guard would weaken a
> gate one increment after it was built to catch this exact class.

**PR2 - the D1 half.** Remove the `!authUser` wall so every route renders for a
guest; apply D5 and D6; flip the four documenting tests to assertions and add
the regression tests from D7. If D1 is overridden to Alternative A, PR2 becomes
"delete the guest-shaped code the product does not actually have" instead, and
the milestone still closes with the same done-when structure.

**Explicitly out of scope:** any change to the header badge's copy, a new
onboarding or sign-in-nag surface, entitlement automation (v0.5, deprioritized),
and anything in `agents/dev-agent/`.

---

## 5. Done when (checkable)

- [x] `/pricing` renders for a signed-in account whose trial has finished, and a
      test asserts the Subscribe CTA reaches a page that actually renders.
      (PR1: "lets a blocked account reach /pricing, so the Subscribe link leads
      somewhere" in `src/app/components/__tests__/subscription-guard.test.tsx`.)
- [ ] Per D1 default: a test renders a route with `authUser = null` and asserts
      page content is present and the "Sign in required" wall is absent.
- [ ] A test asserts an account with `subscriptionStatus === "expired"` is
      blocked even inside the 30-day window (D5), replacing the current test
      that documents the opposite.
- [ ] `getTrialDaysRemaining`'s documented contract matches its behavior, proven
      by the existing malformed-date test (D6).
- [ ] No test in `subscription-guard.test.tsx` still describes a shipped defect
      as expected behavior.
- [ ] `package.json` reads 0.14.0 (bumped in PR2, see the note in section 4).
- [ ] The five CI-pinned gate commands from `.github/workflows/ci.yml`
      (lines 39/42/45/48/54) are green: `npm run lint`, `npm run typecheck`,
      `npm run build`, `npm audit --audit-level=high`, `npm run test:coverage`.

---

## 6. Product rules

No streaks, no infinite feed, no pressure mechanics, calm ADHD-friendly tone.
This milestone only ever *removes* blocking surfaces; it adds no nag, no
countdown, and no "you are missing out" copy. The sign-in invitation stays where
it already is, phrased as an upgrade rather than a requirement.

---

## 7. Risks

- **Sync expectations.** A guest who uses the app for a week and then signs in
  must have their data follow them. That is precisely what v0.13 shipped
  (check-ins since v0.4, journal via PR #113, focus sessions via PR #115), so
  the risk is already retired - but PR2 should exercise at least one migration
  path end to end in a test, because guest access is what makes those code
  paths reachable for the first time.
- **Analytics/monetization surfaces.** `/monetization` is a local-only event
  view; opening it to guests exposes nothing server-side, but if the user wants
  it kept behind sign-in, that is a one-line allowlist and a D1 sub-decision.
- **Perceived regression.** Someone who has only ever seen the wall may read
  the change as "the paywall was removed". It was not: the trial and the
  trial-ended screen are unchanged for signed-in accounts (D4).
