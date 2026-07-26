import { getTrialDaysRemaining, type UserAccount } from "@/lib/firestore-user";

/**
 * What a stored account is entitled to right now.
 *
 * `unknown` is not an error: it is what an account whose `createdAt` cannot be
 * read resolves to. `getTrialDaysRemaining` returns NaN for a malformed date
 * (its own docstring says so, and a test pins it), and NaN answers "no" to
 * every comparison, so two callers doing the same arithmetic reached opposite
 * conclusions about the same record - the gate let the person in, because
 * `NaN <= 0` is false, while the dashboard told them their trial had ended,
 * because `NaN > 0` is also false. Naming the case is what stops that: an
 * `unknown` entitlement never blocks and carries no day count to render.
 */
export type Entitlement =
  | { status: "active" }
  | { status: "trial"; daysRemaining: number }
  | { status: "expired" }
  | { status: "unknown" };

/**
 * The one place that decides what an account gets.
 *
 * Before this module the decision lived twice - `subscription-guard.tsx`
 * computed `isSubscribed`/`isTrialFinished` to choose between the app and the
 * paywall, and `page.tsx`'s membership card recomputed the same thing to choose
 * its status line - so the app's entitlement vocabulary could disagree with
 * itself. Both now read this function; there is no second copy to guard against.
 *
 * Ordering matters here: an explicit `subscriptionStatus` outranks the trial
 * clock in both directions. `"active"` wins however old the account is, and
 * `"expired"` blocks however young it is (decision D5 in
 * docs/design/GUEST_ACCESS_AND_PAYWALL.md). The second half closes a real gap:
 * the status existed in the type and nothing read it, so a cancellation written
 * as `"expired"` would have had no effect at all on an account younger than 30
 * days. Nothing writes that value today, so the fix changes no live account's
 * access; it means the vocabulary is honest before something starts using it.
 */
export function resolveEntitlement(account: UserAccount): Entitlement {
  if (account.subscriptionStatus === "active") {
    return { status: "active" };
  }

  if (account.subscriptionStatus === "expired") {
    return { status: "expired" };
  }

  const daysRemaining = getTrialDaysRemaining(account.createdAt);

  if (!Number.isFinite(daysRemaining)) {
    return { status: "unknown" };
  }

  return daysRemaining > 0 ? { status: "trial", daysRemaining } : { status: "expired" };
}

/**
 * Whether this entitlement withholds the app.
 *
 * Deliberately fails OPEN: only a definite `expired` blocks. An `unknown`
 * entitlement means we could not read the record well enough to charge anyone
 * for it, which is never a reason to lock a person out of a local-first app.
 */
export function blocksAccess(entitlement: Entitlement): boolean {
  return entitlement.status === "expired";
}
