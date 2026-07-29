# ADHD Daily Coach: Your friendly self-improvement coach

> Formerly "Focus", and originally "Calm Daily Coach". Only the display name
> changed: the `calm-daily-coach` localStorage key namespace is deliberately
> frozen so no existing user loses saved plans, journal entries or settings.
>
> The repo slug is still `calm-daily-coach` too. Renaming it to
> `adhd-daily-coach` is a planned two-step operation that briefly breaks the
> live site, because a rename fires no workflow event and Pages keeps serving
> the un-rebuilt artifact. Read the [rename runbook](#renaming-the-repo-runbook)
> **before** renaming.

A deliberate, ADHD friendly self-improvement app where users choose a daily content dose and receive exactly that amount.

Live site: `https://rodmen07.github.io/<repo-slug>/`. Today that is
**https://rodmen07.github.io/calm-daily-coach/** (verified HTTP 200 on
2026-07-29). It becomes **https://rodmen07.github.io/adhd-daily-coach/** only
once the rename *and* the rebuild in the [rename runbook](#renaming-the-repo-runbook)
have both completed; GitHub Pages project URLs do not redirect, so exactly one
of the two is live at any moment.

Core principles:

- No infinite feed.
- No streak pressure.
- Daily cap message once the selected dose is completed.

## Implemented in this first slice

- Mobile-first daily plan flow in [src/app/page.tsx](src/app/page.tsx)
- Plan and rule definitions in [src/lib/plan.ts](src/lib/plan.ts)

## Added in this second slice

- Persistent check-in storage in [src/lib/browser-checkins.ts](src/lib/browser-checkins.ts)
- Completion and skip controls plus weekly stats UI in [src/app/page.tsx](src/app/page.tsx)
- Animated flow-state chips and celebratory completion feedback in [src/app/page.tsx](src/app/page.tsx)
- Explicit daily workflow stepper (Focus -> Plan -> Do -> Review) in [src/app/page.tsx](src/app/page.tsx)
- Hard step locks that prevent plan edits/regeneration until a daily check-in is submitted in [src/app/page.tsx](src/app/page.tsx)
- Animated weekly and focus progress feedback in [src/app/page.tsx](src/app/page.tsx)
- Reduced-motion fallbacks for animated feedback in [src/app/globals.css](src/app/globals.css)
- Animated count-up values for weekly summary totals in [src/app/page.tsx](src/app/page.tsx)
- Staggered reveal motion for weekly summary cards and focus breakdown rows in [src/app/page.tsx](src/app/page.tsx)
- Expanded improvement categories and 5/15/30-minute activity windows in [src/lib/plan.ts](src/lib/plan.ts)
- Added Career, Creativity, and Home focus areas, with the full focus list now kept alphabetical in [src/lib/plan.ts](src/lib/plan.ts)
- Visible improvement category chips in [src/app/page.tsx](src/app/page.tsx)
- Route-based multi-page UX flow for Focus, Execute, and Review in [src/app/focus/page.tsx](src/app/focus/page.tsx), [src/app/execute/page.tsx](src/app/execute/page.tsx), and [src/app/review/page.tsx](src/app/review/page.tsx)
- Shared top-level route navigation shell in [src/app/layout.tsx](src/app/layout.tsx) and [src/app/globals.css](src/app/globals.css)
- Dark-mode-first theme system with a persisted light/dark toggle in [src/app/layout.tsx](src/app/layout.tsx), [src/app/components/theme-toggle.tsx](src/app/components/theme-toggle.tsx), and [src/app/globals.css](src/app/globals.css)
- Switching to light mode now uses an inline confirmation panel so dark mode stays the default experience.
- Shared navigation and card chrome now track the active theme instead of keeping hardcoded light-only surfaces.
- Swipe-enabled step cards with left/right gesture navigation and arrow-key fallback in [src/app/components/swipe-step-card.tsx](src/app/components/swipe-step-card.tsx)
- Swipe-enabled step cards now expose explicit accessible labels and contextual swipe hints in [src/app/components/swipe-step-card.tsx](src/app/components/swipe-step-card.tsx)
- Dashboard now focuses on user metrics and cycle entry only, while step cards carry the primary progression and loop back to dashboard reflection in [src/app/page.tsx](src/app/page.tsx)
- Added monetization entry points with a dashboard Pro upsell panel and dedicated pricing route in [src/app/page.tsx](src/app/page.tsx), [src/app/pricing/page.tsx](src/app/pricing/page.tsx), and [src/app/layout.tsx](src/app/layout.tsx)
- Added local monetization telemetry with plan-interest persistence and CTA click tracking in [src/lib/monetization.ts](src/lib/monetization.ts) and [src/app/hooks/use-monetization.ts](src/app/hooks/use-monetization.ts)
- Added an in-app monetization analytics route for local conversion snapshots in [src/app/monetization/page.tsx](src/app/monetization/page.tsx)
- Added a calm daily affirmation card on the dashboard with deterministic date-based rotation and a refresh action in [src/app/components/AffirmationCard.tsx](src/app/components/AffirmationCard.tsx) and [src/lib/affirmations.ts](src/lib/affirmations.ts)

## Added Google login

- Firebase Google Authentication integration in [src/lib/firebase.ts](src/lib/firebase.ts)
- Sign-in and sign-out controls in [src/app/page.tsx](src/app/page.tsx)
- Local data scoping by signed-in user id to avoid cross-user state on shared devices

## GitHub Pages deployment mode

- This app is configured as a fully static Next.js export for GitHub Pages.
- Plan generation, check-ins, and weekly summaries run in-browser and persist via local storage.
- Reminders are user-driven: an in-session browser nudge, a pre-filled `mailto:` email draft, or a downloadable `.ics` calendar file the user imports themselves.
- The browser nudge can optionally use OS notifications: permission is requested only when the user presses "Allow notifications" (never on load), notifications fire only while an ADHD Daily Coach tab is open (there is no push service, so nothing arrives once the app is closed), and the in-page banner remains the fallback when permission is undecided, denied, or unsupported (for example iOS Safari tabs).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Quality and tests

```bash
npm run lint
npm run typecheck
npm run check
npm run test
npm run test:coverage
```

Current automated coverage focuses on core business logic in `src/lib/plan.ts` and `src/lib/browser-checkins.ts`.
It also includes app behavior tests in `src/app/__tests__/page.test.tsx` for state hydration and auth-unconfigured UX.
Interaction coverage includes generate-plan, mark-complete, and skip-validation actions in `src/app/page.tsx`.
Completion feedback styling and success-state behavior are also covered in `src/app/__tests__/page.test.tsx`.
Progress animation states in the weekly summary are also covered in `src/app/__tests__/page.test.tsx`.
Workflow-step labeling and completion-state transitions are also covered in `src/app/__tests__/page.test.tsx`.
Planner lock/unlock behavior around daily check-in is also covered in `src/app/__tests__/page.test.tsx`.
Explicit Start next day reset behavior after review is also covered in `src/app/__tests__/page.test.tsx`.
Post-reset confirmation messaging and keyboard focus return to the plan generator are also covered in `src/app/__tests__/page.test.tsx`.
Animated feedback respects reduced-motion preferences through CSS fallbacks in `src/app/globals.css`.
Weekly count-up values for totals, completion percentage, and focus counts are also covered in [src/app/__tests__/page.test.tsx](src/app/__tests__/page.test.tsx).
Staggered summary-card and focus-row animation coverage is kept lightweight through the same page interaction suite.
The expanded focus-area set and 5/15/30-minute plan generation are covered in [src/lib/__tests__/plan.test.ts](src/lib/__tests__/plan.test.ts).
The visible category strip is also covered in [src/app/__tests__/page.test.tsx](src/app/__tests__/page.test.tsx).
The route loop across Dashboard, Focus, Execute, and Review is covered in [src/app/__tests__/route-loop.test.tsx](src/app/__tests__/route-loop.test.tsx).
Review insight derivation helpers are covered in [src/lib/__tests__/review-insights.test.ts](src/lib/__tests__/review-insights.test.ts).
Planner state and helper derivation modules are covered in [src/lib/__tests__/planner-state.test.ts](src/lib/__tests__/planner-state.test.ts), [src/lib/__tests__/planner-derivations.test.ts](src/lib/__tests__/planner-derivations.test.ts), and [src/lib/__tests__/reminder-draft.test.ts](src/lib/__tests__/reminder-draft.test.ts).
Check-in submission workflow behavior is covered in [src/lib/__tests__/checkin-workflow.test.ts](src/lib/__tests__/checkin-workflow.test.ts).
Calendar (.ics) reminder generation, folding, escaping, and download behavior are covered in [src/lib/__tests__/reminder-ics.test.ts](src/lib/__tests__/reminder-ics.test.ts) and [src/app/components/__tests__/reminder-settings.test.tsx](src/app/components/__tests__/reminder-settings.test.tsx).
Notification permission handling, OS-notification fallback, and visibility-aware reminder scheduling are covered in [src/lib/__tests__/reminder-notifications.test.ts](src/lib/__tests__/reminder-notifications.test.ts), [src/lib/__tests__/reminder-schedule.test.ts](src/lib/__tests__/reminder-schedule.test.ts), and [src/app/components/__tests__/reminder-settings.test.tsx](src/app/components/__tests__/reminder-settings.test.tsx).
Planner session hydration behavior is covered in [src/lib/__tests__/planner-session.test.ts](src/lib/__tests__/planner-session.test.ts).
The theme toggle and persistence behavior are covered in [src/app/components/__tests__/theme-toggle.test.tsx](src/app/components/__tests__/theme-toggle.test.tsx).
Rust bridge request and fallback behavior are covered in [src/lib/__tests__/rust-coach-bridge.test.ts](src/lib/__tests__/rust-coach-bridge.test.ts).
Pricing route and monetization tier rendering are covered in [src/app/__tests__/pricing-page.test.tsx](src/app/__tests__/pricing-page.test.tsx).
Dashboard and pricing monetization state behavior is covered in [src/app/__tests__/page.test.tsx](src/app/__tests__/page.test.tsx) and [src/app/__tests__/pricing-page.test.tsx](src/app/__tests__/pricing-page.test.tsx).
Monetization summary calculations and analytics route rendering are covered in [src/lib/__tests__/monetization.test.ts](src/lib/__tests__/monetization.test.ts) and [src/app/__tests__/monetization-page.test.tsx](src/app/__tests__/monetization-page.test.tsx).
Daily affirmation rotation and card behavior are covered in [src/lib/__tests__/affirmations.test.ts](src/lib/__tests__/affirmations.test.ts) and [src/app/components/__tests__/AffirmationCard.test.tsx](src/app/components/__tests__/AffirmationCard.test.tsx).
Autonomous execution roadmap is tracked in `docs/AUTONOMOUS_IMPLEMENTATION_PLAN.md`.
The frontend-first functionality plan is tracked in [docs/FRONTEND_FUNCTIONALITY_PLAN.md](docs/FRONTEND_FUNCTIONALITY_PLAN.md).
The monetization strategy is tracked in [docs/MONETIZATION_PLAN.md](docs/MONETIZATION_PLAN.md).

## Maintainability structure

- Auth effects and login actions are isolated in `src/app/hooks/use-coach-auth.ts`.
- Planner state, persistence, and check-in actions are isolated in `src/app/hooks/use-coach-planner.ts`.
- Check-in persistence flows through `src/lib/checkin-store.ts` to support backend migration without UI rewrites.
- `src/app/page.tsx` now focuses on dashboard-only metrics and cycle-entry routing.
- Route pages `src/app/focus/page.tsx`, `src/app/execute/page.tsx`, and `src/app/review/page.tsx` provide a deeper step-by-step UX while reusing the same planner and auth hooks.
- Planner hydration and persistence helpers are centralized in `src/lib/planner-state.ts`.
- Planner session hydration and migration orchestration are centralized in `src/lib/planner-session.ts`.
- Planner-derived helper logic is centralized in `src/lib/planner-derivations.ts`.
- Reminder draft URL generation is centralized in `src/lib/reminder-draft.ts`.
- Check-in submission orchestration is centralized in `src/lib/checkin-workflow.ts`.
- Focus visual metadata is centralized in `src/lib/focus-metadata.ts` to keep route UI components declarative.
- Review analytics derivation logic is centralized in `src/lib/review-insights.ts` to keep the review route focused on rendering.
- Async operation state unions are centralized through `src/lib/async-status.ts` to reduce repeated status type definitions.

### Check-in backend mode

- `NEXT_PUBLIC_CHECKIN_BACKEND` accepts `local` or `firestore`. When it is unset (or empty), the backend resolves automatically: `firestore` when the Firebase config is present AND the user is signed in, `local` otherwise (signed-out visitors, prerenders, and Firebase-less deployments always stay local). Setting `local` explicitly forces local mode regardless of auth state; unrecognized values also resolve to `local`. The full matrix is documented in [src/lib/checkin-store.ts](src/lib/checkin-store.ts).
- In `firestore` mode, the app uses Firestore when available and automatically falls back to local storage on backend errors, so a check-in is never lost.
- Firestore collection path is `users/{uid}/checkins`; the security rules the Firebase console needs are documented in [docs/FIRESTORE_RULES.md](docs/FIRESTORE_RULES.md) (deploying them is a user/console action).
- On sign-in, guest check-ins are migrated to the signed-in scope once per backend mode with an idempotent migration marker. Because the marker is per backend, users who previously synced under the local default get a one-time migration of any remaining guest check-ins into Firestore on their first signed-in visit after the flip.
- Rollback: set the repository variable `NEXT_PUBLIC_CHECKIN_BACKEND` to `local` (inlined at build time by [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)) and re-deploy to force local-only check-ins without a code change. Local check-in data is never deleted by the flip in either direction.

### Stripe billing (Payment Link mode)

- Configure `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` with a Stripe-hosted Payment Link URL for the $5/month membership; set it as the repository Variable `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` so [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) inlines it at build time.
- When set, the signed-in pricing CTA opens the Payment Link in a new tab with `client_reference_id=<firebase uid>` and `prefilled_email` appended, so payments are attributable with zero backend.
- When unset, the pricing CTA keeps the early-access mailto flow; both channels log `pricing_cta_clicked` with a channel detail for conversion analysis.
- Entitlement remains manual for now: after a payment, set `subscriptionStatus: "active"` on the matching `users/{uid}` Firestore document.
- Billing helpers and CTA behavior are covered in [src/lib/__tests__/billing.test.ts](src/lib/__tests__/billing.test.ts) and [src/app/__tests__/pricing-page-billing.test.tsx](src/app/__tests__/pricing-page-billing.test.tsx).

### Rust coaching bridge mode

- Configure `NEXT_PUBLIC_RUST_COACH_BRIDGE_URL` to enable optional Rust-powered coaching hints.
- When configured, planner flows call the bridge with JSON payloads compatible with `new-crate-project` stdin bridge semantics.
- If the bridge is unavailable or returns an error, ADHD Daily Coach automatically falls back to its local planner/check-in logic.
- GitHub Pages static deploy remains functional without this variable.

## Branch protection quality gate

- Workflow `.github/workflows/ci.yml` runs lint, tests, and coverage on pushes and pull requests to `main`.
- Coverage HTML artifacts are uploaded on each workflow run.

## Configure Google auth

1. Create a Firebase project.
2. Enable Authentication and turn on Google provider.
3. Add authorized domains:
	- localhost
	- rodmen07.github.io
4. Copy [.env.example](.env.example) to `.env.local` and fill all NEXT_PUBLIC_FIREBASE values.
5. Restart local dev server after env changes.

### OAuth troubleshooting checklist

If Google login fails on the live site, verify these first:

1. Firebase Authentication -> Sign-in method -> Google is enabled.
2. Firebase Authentication -> Settings -> Authorized domains includes `rodmen07.github.io`.
3. GitHub repository secrets for deploy workflow include all NEXT_PUBLIC_FIREBASE_* values.
4. `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` matches your Firebase project auth domain (usually `<project-id>.firebaseapp.com`).
5. Browser popup blockers are disabled for the live site.

The app now shows Firebase error codes/messages in UI to make production diagnosis faster.

## Reminders

Reminder preferences (opt-in, daily time, and channel) are configured from the dashboard `ReminderSettingsPanel` in [src/app/components/reminder-settings.tsx](src/app/components/reminder-settings.tsx) and persist per user scope via [src/lib/reminder-preferences.ts](src/lib/reminder-preferences.ts). Nothing is ever sent automatically; all three channels work on GitHub Pages with zero backend cost.

- Browser channel: an in-session nudge at the chosen time while the app is open (scheduling math in [src/lib/reminder-schedule.ts](src/lib/reminder-schedule.ts)).
- Email channel: opens a prefilled `mailto:` draft that the user sends themselves ([src/lib/reminder-draft.ts](src/lib/reminder-draft.ts)).
- Calendar channel: generates an `adhd-daily-coach-reminder.ics` file entirely in the browser ([src/lib/reminder-ics.ts](src/lib/reminder-ics.ts)) with a daily recurring event, a display alarm, and a stable UID so re-importing an updated file replaces the event in most calendar apps. The filename is branding only; dedup is by the frozen `UID`, so the file was renamed off the retired "Focus" name without orphaning anyone's existing event. The user imports the file into Google Calendar, Apple Calendar, or Outlook, and their calendar app does the reminding, even while ADHD Daily Coach is closed. Event times are floating local times (no timezone id), so they ring at the chosen wall-clock time in most clients; Google Calendar pins floating times to the calendar's home timezone. After changing the reminder time, download and import a fresh file to replace the old event.

## API contracts

No server API routes in Pages mode.

## Persistence notes

- Signed-in users on Firebase-enabled deployments sync check-ins to Firestore by default (the v0.4 flip); every Firestore failure falls back to browser local storage so nothing is lost.
- Signed-out usage, deployments without Firebase config, and deployments that set `NEXT_PUBLIC_CHECKIN_BACKEND=local` keep check-ins in browser local storage, where data stays device/browser specific.
- The header sync badge in [src/app/components/sync-status-badge.tsx](src/app/components/sync-status-badge.tsx) reflects the actual resolved backend for the current auth state: `CLOUD SYNCED` when the signed-in session resolves to a live Firestore (the default when Firebase is configured), `SYNC OFF (LOCAL)` when Firestore mode is explicitly configured but unavailable, `SIGNED IN (LOCAL)` when the deployment forces the local backend, and `LOCAL WORKSPACE` / `GUEST (LOCAL)` for signed-out or unconfigured sessions.

## Deploy to GitHub Pages

1. Push to `main`.
2. Workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) builds and deploys automatically.
3. In repository settings, set Pages source to GitHub Actions if not already set.

## Renaming the repo (runbook)

Renaming `calm-daily-coach` -> `adhd-daily-coach` **breaks the live site until a
rebuild is triggered by hand.** Do the two steps back to back.

Why: `basePath`, `assetPrefix` and the `.ics` app URL are all derived from
`GITHUB_REPOSITORY` in [site-base-path.mjs](site-base-path.mjs), so no tracked
file has to be edited for a build to be correct under the new slug. **That fixes
the next BUILD. It does not rebuild the artifact already deployed.** A repo
rename fires no workflow event, and `deploy-pages.yml` triggers only on `push`
to `main` and `workflow_dispatch`, so at the instant of the rename Pages keeps
serving the SAME un-rebuilt artifact at the new URL with every asset reference
inside it still prefixed `/calm-daily-coach/`. All 13 routes come back unstyled
and unhydrated. There is no ordering of the merge and the rename that avoids
this window; keep it short.

1. **Rename the repo**: GitHub -> Settings -> General -> Repository name ->
   `adhd-daily-coach`.
2. **Immediately trigger a rebuild** - this is the step that repairs the live
   site, and the outage lasts until it finishes:
   `gh workflow run "Deploy to GitHub Pages" --repo rodmen07/adhd-daily-coach`
   (or push an empty commit to `main`), then `gh run watch`.
3. **Verify the new URL**, and not just for a 200 - the stale artifact returns
   200 too, so the assertion that matters is that the old prefix is gone:
   ```bash
   curl -sI https://rodmen07.github.io/adhd-daily-coach/            # expect 200
   curl -sL https://rodmen07.github.io/adhd-daily-coach/ | grep -c "/calm-daily-coach/"
   #                                                                 expect 0
   ```
4. **Update external links** (the `Live site` URL above, `docs/ROADMAP.md`, the
   `Portfolio/infraportal` case study, and `git remote set-url origin`).

Full detail, including everything that is a literal rather than derived and what
must NOT be rewritten, is in [docs/RENAME_RUNBOOK.md](docs/RENAME_RUNBOOK.md).

## Dependabot updates

- This repository pins npm to the public registry in [.npmrc](.npmrc).
- Dependabot registry behavior is configured in [.github/dependabot.yml](.github/dependabot.yml).
- These settings prevent private-registry resolution errors during npm security update runs.

## Next implementation steps

The canonical forward roadmap now lives in [docs/ROADMAP.md](docs/ROADMAP.md) (as of 2026-07-18); the steps below are the earlier short list.

1. Replace local browser storage with Firestore sync per authenticated user. (Shipped in v0.4: Firestore is now the default for signed-in users on Firebase-enabled deployments, with automatic local fallback.)
2. Add time-based reminder scheduling through a backend worker.
3. Automate Stripe entitlement (webhook -> Firestore `subscriptionStatus`) on top of the shipped Payment Link checkout, then add paid trial gating.
