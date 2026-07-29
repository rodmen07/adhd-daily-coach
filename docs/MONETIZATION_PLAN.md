# ADHD Daily Coach Monetization Plan

> STATUS (2026-07-18): PARTIALLY SUPERSEDED. The Free/Pro/Team feature-gate and Starter/Pro/Team metrics sections below are
> retired by the single $5/month membership model; ladder steps 4 and 5 carry forward in [ROADMAP.md](ROADMAP.md).

## Outcome

Introduce sustainable revenue without breaking the product promise of deliberate, low-noise coaching.

## Packaging (updated 2026-07-18)

- One single membership, no tiers: every feature included after a 30-day free trial.
- The Starter/Pro/Team split below is retired; historical sections are kept only where they describe shipped telemetry.

## Price

- $5 per month, single membership (shipped model; replaces the earlier $8 Pro / $24 Team hypothesis).

## Monetization Ladder

1. Build conversion surfaces in product:
   - Pricing route.
   - Dashboard upgrade card.
   - Primary navigation access to pricing.
   - Local plan-interest persistence and click-event logging for conversion analysis.
2. Capture demand before payments:
   - Early-access mailto flow.
   - Track click-through and interest by plan.
   - Expose an in-app local analytics snapshot to validate conversion UX changes quickly.
3. Add billing integration (shipped 2026-07-18, zero-backend mode):
   - Stripe Payment Link for the single $5/month membership, driven by `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` (no code deploy needed to change the link).
   - The pricing CTA appends `client_reference_id=<firebase uid>` and `prefilled_email` so each payment is attributable without a backend.
   - When the variable is unset, the CTA falls back to the early-access mailto flow.
   - Entitlement flip stays manual for now: set `subscriptionStatus: "active"` on `users/{uid}` in Firestore after matching the payment's `client_reference_id`; webhook automation is a future step.
4. Add entitlement controls:
   - Feature flags for Pro and Team surfaces.
   - Clear locked-state messaging in free mode.
5. Expand paid value:
   - Advanced weekly narratives.
   - Reminder automation.
   - Cloud sync and recovery support.

## Feature Gate Proposal

- Free:
  - Daily flow routes.
  - Basic weekly totals.
- Pro:
  - Narrative weekly insights.
  - Adaptive plan tuning suggestions.
  - Reminder automation windows.
  - Cloud sync status and restore.
- Team:
  - Shared review templates.
  - Team summary panels.
  - Coach visibility snapshots.

## Metrics To Track

- Pricing page visits.
- Click-through rate on upgrade calls to action.
- Pricing CTA channel split via event detail: `stripe_payment_link` vs `mailto_upgrade`.
- Selected plan-interest distribution (Starter/Pro/Team).
- Early access sign-up rate.
- Free to Pro conversion rate.
- 30-day Pro retention.

## Delivery Sequence

1. Frontend conversion surface rollout.
2. Demand capture and measurement.
3. Billing plumbing.
4. Entitlement enforcement.
5. Paid feature expansion.
