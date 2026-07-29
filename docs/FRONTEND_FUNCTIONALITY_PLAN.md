# ADHD Daily Coach - Frontend Functionality Plan

> STATUS (2026-07-18): SUPERSEDED. All six priority items are complete (weekly insights, browser reminders,
> and offline/sync status shipped 2026-07-18). This doc is kept as a historical completion log; forward work
> now lives in [ROADMAP.md](ROADMAP.md).

## Goal

Grow the site from a polished flow shell into a more useful daily coaching product while keeping the work frontend-first.

## Latest Iteration (2026-07-02)

- Dashboard membership panel now reflects the real single-plan model instead of legacy multi-tier messaging.
- Membership status messaging is now state-aware: signed out, checking, trial days remaining, active, or expired.
- Dashboard CTA language was simplified to align with one $5/month membership after a 30-day free trial.
- Dashboard tests were updated to cover the new copy and call-to-action behavior.

## Completed (2026-07-02)

- Focused onboarding UX pass shipped to reduce first-session friction.
- Added a quick-start preset path that configures focus, dose, and theme in one action.
- Added finish-early actions so users can save onboarding defaults from step 1 or step 2.
- Added a live defaults summary panel during onboarding for clearer decision confidence.
- Updated onboarding component tests to cover quick-start completion and persisted preferences.

## In Progress (2026-07-02)

- Add onboarding funnel analytics events for start, step views, preset picks, skip, and completion. Completed.
- Surface onboarding funnel metrics in the local analytics page to measure first-session drop-off. Completed.

## Completed (2026-07-02) - Onboarding Analytics

- Added onboarding funnel event tracking in the shared local analytics utility.
- Wired onboarding UI interactions to log start, step views, preset selections, skip, and completion.
- Extended analytics dashboard cards with onboarding starts, completions, step views, and preset usage detail.
- Updated monetization analytics tests for onboarding funnel summary expectations.

## In Progress (2026-07-02) - Dashboard UX

- Add a compact onboarding funnel health badge to the dashboard for at-a-glance adoption visibility. Completed.

## In Progress (2026-07-03) - Code Quality and Maintainability Pass

- Extract focus category metadata into a shared typed module so page-level UI does not embed icon selection logic.
- Extract weekly review insight derivations into pure helper functions with focused tests.
- Reduce route component complexity in `focus/page.tsx` and `review/page.tsx` by moving non-render business logic into `src/lib`.
- Introduce a reusable async status type for planner operation states to remove repeated union definitions.
- Keep behavior stable while improving readability and modular boundaries.

## Completed (2026-07-03) - Code Quality and Maintainability Pass

- Extracted focus category metadata into `src/lib/focus-metadata.ts` and removed inline icon-selection branching from the Focus route.
- Extracted weekly review derivation logic into `src/lib/review-insights.ts` and simplified `src/app/review/page.tsx` to consume pure helpers.
- Added focused unit coverage for review insight derivations in `src/lib/__tests__/review-insights.test.ts`.
- Introduced a shared async operation status type in `src/lib/async-status.ts` and updated planner hook state typing to reduce repeated union definitions.

## In Progress (2026-07-03) - Planner Hook Decomposition

- Decompose `use-coach-planner` internals into focused lib modules while preserving its external API.
- Extract planner state hydration/persistence helpers.
- Extract reminder draft URL generation.
- Extract planner-derived analytics helpers.
- Add focused unit tests for extracted helper modules.

## Completed (2026-07-03) - Planner Hook Decomposition

- Extracted planner hydration/persistence logic to `src/lib/planner-state.ts`.
- Extracted planner derivation helpers (`doseToRustEffort`, `deriveTopFocus`) to `src/lib/planner-derivations.ts`.
- Extracted reminder draft generation to `src/lib/reminder-draft.ts`.
- Updated `use-coach-planner` to consume these modules while preserving the hook's public API.
- Added focused tests for each extracted module: `planner-state.test.ts`, `planner-derivations.test.ts`, and `reminder-draft.test.ts`.

## In Progress (2026-07-03) - Check-in Flow Extraction

- Extract check-in submit and advisory orchestration from `use-coach-planner` into a dedicated lib module.
- Preserve route behavior and hook API while reducing hook-level side-effect complexity.
- Add focused unit coverage for success/error check-in paths.

## Completed (2026-07-03) - Check-in Flow Extraction

- Extracted check-in submission workflow into `src/lib/checkin-workflow.ts`.
- Updated `use-coach-planner` to consume the extracted module while preserving public hook behavior.
- Added focused test coverage in `src/lib/__tests__/checkin-workflow.test.ts` for validation, done/skipped success paths, and storage failures.

## In Progress (2026-07-03) - Planner Session Hydration Extraction

- Extract hydration, migration status, and weekly summary bootstrap orchestration from `use-coach-planner` into a focused session module.
- Preserve current route behavior and keep hook API stable.
- Add focused tests for migrated, error, and summary-fallback hydration scenarios.

## Completed (2026-07-03) - Planner Session Hydration Extraction

- Extracted hydration, migration messaging, and weekly summary bootstrap flow to `src/lib/planner-session.ts`.
- Updated `use-coach-planner` to consume the session module while preserving route behavior and hook API.
- Added focused tests in `src/lib/__tests__/planner-session.test.ts` for guest scope, migration success, and summary failure fallback scenarios.

## Completed (2026-07-02) - Dashboard Onboarding Health

- Added a dashboard onboarding health badge with starts, completions, skips, and conversion rate.
- Added status labels for onboarding funnel quality (no runs, strong, moderate, needs iteration).
- Added dashboard shortcut to the detailed onboarding funnel analytics page.
- Updated dashboard tests to validate onboarding health badge rendering and conversion state display.

## Completed (2026-07-02) - Daily Plan Editor

- Added constrained edit flow to the Execute view so users can update the text of their action sprints and reflection questions without altering the configured category and dose.
- Added a `resetPlan` option directly exposed on the locked Focus generator so users can clear yesterday's unsaved check-in or cancel out of an incomplete day.

## Guiding Rule

- Prefer frontend changes first.
- Add middleware or backend work only when the frontend needs it to keep moving.
- Keep each step small, testable, and shippable.

## Priority Order

### 1. Dashboard Action Rail

Build a clearer dashboard action rail that shows the current cycle state and gives users one obvious next step.

Deliverables:
- Prominent action cards for Focus, Execute, and Review.
- State-aware copy such as ready, locked, or complete.
- A single primary action that matches the current cycle state.

Success criteria:
- Users can tell what to do next without reading the whole page.
- The dashboard remains a reflection point, not a duplicate planner screen.

### 2. Lightweight Onboarding

Add a short first-visit setup flow to capture default focus areas, preferred dose, and theme preference.

Deliverables:
- First-run onboarding panel or modal.
- Saved local preferences for focus, dose, and theme.
- A skip path so returning users are not blocked.

Success criteria:
- New users can reach a useful default setup in under a minute.
- Returning users skip onboarding automatically.

### 3. Weekly Insights (Completed 2026-07-18)

Add a more meaningful weekly summary that explains patterns, not just totals.

Deliverables:
- [x] Focus-area trend breakdown.
- [x] Most-used dose and strongest completion window.
- [x] A short “what changed this week” summary: `getWeekOverWeekChange` in `src/lib/review-insights.ts` compares the current 7-day window against the prior 7 days (session and completion-rate deltas, top-focus shift) with calm, judgment-free narratives, rendered as a "What changed this week" card on the review route.

Success criteria:
- The weekly view helps users make a next-cycle decision.
- Insights are easy to scan on mobile.

### 4. Daily Plan Editor (Completed)

Allow small, constrained edits to today’s generated plan so users can adapt it without opening the door to unlimited editing.

Deliverables:
- [x] Edit action and limited plan fields.
- [x] Guardrails that keep the plan deliberate.
- [x] Clear reset behavior when the plan is regenerated.

Success criteria:
- Users can adjust today’s plan when reality changes.
- The plan still feels bounded and intentional.

### 5. Browser Reminders (Completed 2026-07-18)

Add reminder setup in the UI first, with the lightest delivery mechanism that fits the static site.

Deliverables:
- [x] Reminder preference UI: dashboard `ReminderSettingsPanel` with opt-in toggle, time picker, and channel choice, persisted per storage scope via `src/lib/reminder-preferences.ts`.
- [x] Browser scheduling (in-session nudge at the chosen time while the app is open, via `src/lib/reminder-schedule.ts`) and email draft support (surfaces the planner's existing mailto draft flow).
- [x] Clear copy explaining what is and is not sent automatically.

Success criteria:
- Users can opt into reminders without leaving the site flow.
- Reminder behavior stays compatible with GitHub Pages deployment.

### 6. Offline and Sync Status (Completed 2026-07-18)

Expose whether the app is using local data or account-backed sync, and make that state visible in the dashboard.

Deliverables:
- [x] Sync/local status indicator: header `SyncStatusBadge` now derives its state from the check-in store's resolved backend, not just auth state.
- [x] Clear fallback messaging when backend support is unavailable: `SYNC OFF (LOCAL)` when Firestore mode is configured but unreachable, `SIGNED IN (LOCAL)` when the deployment keeps data on-device.
- [x] Explicit status in the dashboard header or action rail (site-wide header badge in `src/app/layout.tsx`).

Success criteria:
- Users know whether their data is local or synced.
- Backend support does not block frontend usage.

## Suggested Execution Rhythm

1. Implement the smallest visible slice for the highest-priority item.
2. Add or update focused tests in the same change.
3. Validate with lint, typecheck, test, and build where relevant.
4. Update the README or implementation notes when the behavior changes.

## Current Starting Point

- Start with the dashboard action rail.
- Keep the next work constrained to the existing frontend flow.
- Only introduce supporting backend or middleware work when a frontend feature needs it to function.