# Focus in Trends: surface focus sessions on /trends + optional sync (v0.12)

This is the product-analyst definition of the next milestone. Like the v0.10
(THEME_CONSISTENCY.md) and v0.11 (TRENDS_OVER_TIME.md) design docs before it,
every choice below is an **explicitly flagged, overridable default**, so the
user can accept the whole milestone with one word or redirect any single
decision without unpicking the rest. Nothing here is a hard review gate.

## 0. Why this document exists

Two features shipped since the last product-role pass (2026-07-20, PR #95) and
neither is reflected as a forward milestone:

- **v0.11 Trends** (`/trends`) shipped as PR #96 (impl) + PR #97 (a11y audit);
  package.json is at 0.11.0. It surfaces a 4-week check-in trend but nothing
  about focus sessions.
- **NF-6 "one thing now"** (`/now`) shipped as PR #104: a calm single-task
  focus timer with a local-first `focus-session.ts` store. It landed as a
  net-new capability outside the numbered v0.x sequence and was never given a
  milestone number.

The `/now` store already exposes a pure `summarizeFocusSessions()` that the
`/now` page uses for its in-page recap, but that summary lives and dies on the
`/now` page. The one place a person goes to see "how has my week been" - the
`/trends` page - shows check-ins only. The follow-up was filed as backlog item
**NF-6b** on 2026-07-23. This document promotes NF-6b to **v0.12** and gives it
a checkable done-when.

## 1. Candidates considered

The backlog's remaining forward candidates at the time of writing:

1. **Focus sessions in Trends (NF-6b).** Surface the existing
   `summarizeFocusSessions` output as a calm card on `/trends`, and optionally
   give focus sessions the same Firestore sync check-ins and journal entries
   already have. Frontend/BaaS-only, agent-doable now, milestone-sized.
2. **Reminder-reach expansion via Firebase Cloud Messaging** (Later /
   candidates). Real push notifications. Needs a service worker plus
   console-side FCM/VAPID setup - multiple USER-ONLY gates before any code is
   exercisable, so **not** agent-doable now.
3. **Performance pass** (bundle analysis, web-vitals). No instrumentation
   baseline exists yet, so "faster" is not CI-checkable without a preceding
   instrumentation increment. Stays in Later.
4. **Playwright E2E smoke test.** Better framed as a QA-stream item than a
   product milestone; left in Later.
5. **Remove dead `src/lib/mailer.ts` + nodemailer.** Real hygiene but a
   single-PR cleanup, not a user-visible milestone; a DevSecOps/QA candidate.

**Decision: promote candidate 1 to v0.12.** It is the only forward candidate
that is simultaneously (a) genuinely new user-visible capability, (b)
frontend/BaaS-only with no new USER-ONLY gate to *start* (the Firestore-sync
half reuses the exact adapter pattern v0.9 already shipped for the journal),
and (c) the natural convergence of the two most recent features (Trends +
focus sessions), so it compounds rather than opening a new surface.

**Overridable default:** if the user would rather do candidate 2/3/4/5 next,
say so and this document is set aside; nothing here forecloses them.

## 2. What's actually there today (the audit)

Verified against the live tree on 2026-07-25, not inherited from prose:

- **`src/lib/focus-session.ts`** is local-first (mirrors `browser-checkins.ts`).
  Public surface: `listFocusSessions(scopeKey = "guest")`,
  `addFocusSession(input, scopeKey)`, and the pure
  `summarizeFocusSessions(sessions, now = new Date())` returning
  `{ sessionsToday, minutesToday, sessionsThisWeek, minutesThisWeek }`. Storage
  key `calm-daily-coach-focus-sessions:{scope}`. The module docstring already
  names Firestore sync as "a possible follow-up" and enforces the product rules
  by design (only deliberately closed-out sessions are recorded; summaries
  never compute a streak, target, or completion rate).
- **`src/app/now/page.tsx`** is the only consumer of that summary today.
- **`src/app/trends/page.tsx`** reads check-ins exclusively through
  `createCheckinStore(...).getCheckinsInRange(...)` and renders via
  `getTrendSummary` (`src/lib/trend-insights.ts`). It imports nothing from
  `focus-session.ts`; its "focus areas" panel is check-in *dose categories*,
  not NF-6 focus *sessions* (confirmed by grep: no `focus-session` import).
- **The sync pattern already exists twice.** Check-ins:
  `checkin-store.ts` + `firestore-checkins.ts`. Journal:
  `journal-store.ts` + `firestore-journal.ts` (v0.9, PR #89/#90), whose
  `users/{uid}/journal/{entryId}` rules block is documented in
  `docs/FIRESTORE_RULES.md`. Both resolve their backend through
  `resolveCheckinBackend` / `NEXT_PUBLIC_CHECKIN_BACKEND` with a safe local
  fallback. **There is no `firestore-focus-sessions.ts` and no focus-session
  adapter yet** (confirmed: `ls src/lib/firestore-focus*` is empty).

## 3. Technical plan

Two small PRs. PR1 is pure frontend and needs no backend at all; PR2 adds the
optional sync and reuses the established adapter shape verbatim.

### 3.1 PR1 - Focus card on /trends (frontend only, local read)

- Add a **"Focus sessions this week"** card to `/trends` that renders
  `summarizeFocusSessions`'s `sessionsThisWeek` + `minutesThisWeek` in the same
  calm, non-streak tone as the existing trend narrative (e.g. "You focused
  through N sessions this week, M minutes in total." with a neutral zero state
  "No focus sessions yet this week - that's completely fine.").
- Reuse the existing `summary-card` / `focus-row` CSS primitives and the
  page's existing `<h2>` heading pattern - **no new chart library, no new
  illustration** (default; overridable if the user wants a dedicated
  visual).
- **Default: read local `listFocusSessions()` in PR1**, matching how the
  `/now` page reads today. The Firestore-synced read lands in PR2 so PR1 can
  ship with zero backend risk. (Overridable: fold both into one PR if the user
  prefers a single milestone PR.)
- The card is additive; it does not alter the existing check-in trend panels.

### 3.2 PR2 - Optional Firestore sync (BaaS-only, mirrors v0.9 journal)

- New `src/lib/firestore-focus-sessions.ts` mirroring `firestore-journal.ts`:
  write a session under `users/{uid}/focusSessions/{sessionId}` on close-out,
  read the last-7-days window for the summary, with per-document field
  validation (skip malformed docs, the pattern hardened in PR #90).
- New `src/lib/focus-session-store.ts` adapter mirroring `journal-store.ts`:
  resolve the backend through the existing `resolveCheckinBackend` /
  `NEXT_PUBLIC_CHECKIN_BACKEND` policy (**no new env var** - default), local /
  firestore / firestore-fallback shape, with the same
  firestore-error-falls-back-to-local safety `checkin-store.ts` uses. The
  `/trends` focus card and the `/now` page both read through this adapter.
- `docs/FIRESTORE_RULES.md` gains a `users/{uid}/focusSessions/{sessionId}`
  match block: owner-only read/create/update via `isOwner(uid)`, delete denied,
  matching the journal block's shape exactly.
- **Guest-to-account migration of past local focus sessions is OUT of scope**
  for v0.12 (default), matching how v0.9 scoped journal migration out. The
  adapter's local-fallback keeps existing sessions working meanwhile.
- **USER-ONLY carry-over (does not block the code):** publishing the updated
  ruleset in the Firebase console. Until then Firestore's deny-by-default plus
  the adapter's local fallback keep sessions on localStorage exactly as today,
  identical to the journal's live behavior.

### 3.3 Tests

- PR1: a `trends-page` test asserting the focus card renders the summary from a
  seeded local store, plus a calm-tone guard (no "streak"/"goal"/"rate" text),
  extending the existing `trends-page.test.tsx` and the focus-session copy
  guard test pattern from NF-6.
- PR2: a `focus-session-store.test.ts` mirroring `checkin-store.test.ts` /
  `journal-store.test.ts` (local / firestore / fallback / explicit-override
  coverage), and a `firestore-focus-sessions.test.ts` mocking the
  `firebase/firestore` SDK directly to exercise the real read/write body and
  prove malformed-doc skipping - mirroring `firestore-journal.test.ts`.
- Regression bar: any new interactive element is keyboard-reachable with the
  app-wide focus-visible ring and honors the universal reduced-motion reset
  (both already global since PR #87); the QA stream audits `/trends` again
  after PR1 the way it did for v0.11 (PR #97).

## 4. Product-rule guardrails (non-negotiable)

The `focus-session.ts` summary is already streak-free by design. v0.12 must not
reintroduce pressure: **no streak, no daily target, no completion rate, no "you
skipped" record** on the Trends card. The zero state is neutral, never a nudge.
A copy-guard test enforces this (section 3.3), matching NF-6's own guard.

## 5. Done-when (checkable)

PR1 (frontend, ships first):

- `/trends` renders a focus-session summary card reading `sessionsThisWeek` +
  `minutesThisWeek`, with a neutral zero state, verified by a new test.
- A calm-tone guard test asserts the card copy contains no streak/target/rate
  language and is verified to fail against a deliberately-pressuring string.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` are green
  on the quality-gate check.

PR2 (optional Firestore sync):

- `src/lib/firestore-focus-sessions.ts` + `src/lib/focus-session-store.ts` exist
  and route through the existing `resolveCheckinBackend` policy with a tested
  local fallback (no new env var).
- `docs/FIRESTORE_RULES.md` documents the `users/{uid}/focusSessions/{sessionId}`
  match block; the doc's field list matches the `FocusSession` type in code.
- Store + Firestore-module tests exist mirroring the journal ones and pass.
- The four gate commands stay green.

package.json bumps to **0.12.0** in the first implementation PR (per the
one-bump-per-milestone convention), not in this definition.

## 6. Overridable defaults, in one place

| Decision | Default | Override |
|---|---|---|
| Which candidate is v0.12 | Focus in Trends (NF-6b) | pick candidate 2-5 instead |
| PR split | PR1 local card, PR2 sync | single PR if preferred |
| Trends focus card visual | reuse `summary-card`/`focus-row`, no new chart | add a dedicated visual |
| Sync env var | reuse `NEXT_PUBLIC_CHECKIN_BACKEND` | a dedicated focus-session toggle |
| Past-session migration | out of scope for v0.12 | include guest-to-account migration |
| Delete on Firestore | denied (matches journal) | allow owner delete |

If the user accepts the defaults, v0.12 proceeds as PR1 then PR2 with no
further decision required.
