# ADHD Daily Coach - Autonomous Implementation Plan

> STATUS (2026-07-18): PARTIALLY SUPERSEDED. Phases 1 to 3 are done except Phase 3 item 4, server-side scheduled
> reminders (the progress log ends 2026-06-27 and misses PR #52 onward); Phases 4 to 6 and that open
> reminder-scheduling decision are folded into [ROADMAP.md](ROADMAP.md), the canonical forward roadmap.

## Mission

Improve the product across six dimensions while maintaining release stability:

1. UI/UX flow quality
2. Frontend visual design and accessibility
3. Backend-powered functionality
4. Performance and operational optimization
5. Security hardening and review
6. Code quality, testing, and CI/CD reliability

## Baseline Snapshot (2026-06-27)

- Next.js static export app with Firebase auth and local-storage persistence.
- Lint, unit tests, and coverage already automated in CI.
- Build is healthy.
- `npm audit --audit-level=high` reports no high/critical issues (moderate transitive issues only).

## Execution Style

- Work in small, production-safe increments.
- Keep each change measurable and testable.
- Prefer additive migrations for backend adoption, not hard cutovers.
- Ship docs with each implementation change.

## Phase 1 - Foundation Hardening (in progress)

### Goals

- Strengthen quality gates and local developer workflow.
- Make auth and runtime failures diagnosable quickly.
- Improve confidence in core user flows.

### Work Items

1. Add explicit TypeScript typecheck command.
2. Add consolidated `check` command (lint + typecheck + tests).
3. Update CI gate to enforce check + build + coverage + security-high audit.
4. Add/maintain interaction tests for generate-plan, check-in, and auth errors.

### Exit Criteria

- CI blocks merges when lint, typecheck, tests, build, or high-severity audit fails.
- Core happy-path interactions are covered by tests.

## Phase 2 - UI/UX Flow Upgrade

### Goals

- Reduce friction in daily plan completion and reflection logging.
- Improve clarity of progress and state transitions.

### Work Items

1. Introduce explicit multi-step flow: choose focus -> generate plan -> close day -> review week.
2. Add lightweight completion animations and clearer action feedback.
3. Add empty, loading, and error states with consistent messaging.
4. Improve mobile ergonomics: larger touch targets and sticky primary action.
5. Add accessibility pass: keyboard navigation, labels, aria-live status updates, contrast checks.

### Exit Criteria

- New flow reduces unnecessary taps/clicks to complete daily plan.
- Accessibility checks pass for keyboard and screen-reader basics.

## Phase 3 - Backend Support Expansion

### Goals

- Introduce backend support without breaking static deployment path.
- Enable multi-device data consistency and future premium features.

### Work Items

1. Add backend abstraction layer for check-ins and reminders.
2. Implement Firestore-backed check-ins with user-scoped documents.
3. Keep local-storage adapter as fallback/offline mode.
4. Add server-side scheduled reminders (cloud function or worker).
5. Add migration path from local storage to backend per user.

### Exit Criteria

- Authenticated users get cross-device check-in sync.
- Reminder scheduling works independently of local device state.

## Phase 4 - Performance and Reliability

### Goals

- Improve runtime responsiveness and deployment reliability.

### Work Items

1. Reduce hydration work and re-renders in page-level state.
2. Add bundle analysis and track JS payload regressions.
3. Introduce simple web-vitals instrumentation and reporting.
4. Add cache strategy for static assets and optimize Firebase SDK loading.

### Exit Criteria

- Measurable bundle/runtime improvements with documented before/after metrics.

## Phase 5 - Security Review and Hardening

### Goals

- Raise security confidence for auth, secrets, and input handling.

### Work Items

1. Add secure headers for exported/static hosting constraints.
2. Verify Firebase auth domain/provider settings in deployment docs.
3. Add automated secret scanning and dependency review checks.
4. Expand threat model notes for auth flow and reminder actions.

### Exit Criteria

- Security checklist integrated into release workflow.
- No unresolved high/critical dependency vulnerabilities.

## Phase 6 - Product Completeness and Developer Experience

### Goals

- Prepare for sustained feature delivery.

### Work Items

1. Add Playwright E2E smoke tests for top user journey.
2. Add PR template/checklist for testing, security, and docs impact.
3. Add release notes automation and deployment verification checks.
4. Add lightweight observability for auth and reminder failures.

### Exit Criteria

- Repeatable release process with automated validation.

## Initial Priority Queue (Next 3 autonomous cycles)

1. Implement stronger quality gate commands and CI wiring.
2. Add flow-state UI improvements for plan generation and check-in completion feedback.
3. Draft backend storage adapter contract and Firestore migration plan.

## Progress Log

- 2026-06-27: Added `typecheck` and `check` commands and upgraded CI quality gate.
- 2026-06-27: Added flow-step progress indicators and accessibility live regions in UI.
- 2026-06-27: Added check-in storage adapter and migrated planner hook to backend-agnostic store API.
- 2026-06-27: Implemented Firestore-backed check-in adapter path with automatic local fallback.
- 2026-06-27: Added idempotent guest-to-account check-in migration with UI status feedback.