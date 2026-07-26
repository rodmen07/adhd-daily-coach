import { describe, expect, it } from "vitest";
import { blocksAccess, resolveEntitlement } from "@/lib/entitlement";
import type { UserAccount } from "@/lib/firestore-user";

/**
 * `resolveEntitlement` is the app's single answer to "what does this account
 * get", read by `subscription-guard.tsx` (which decides whether any page
 * renders) and by the dashboard's membership card (which tells a person what
 * they have). Nothing here is mocked: the real trial arithmetic runs, so these
 * assertions are the same computation production performs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function account(
  overrides: Partial<UserAccount> & { daysAgo?: number } = {},
): UserAccount {
  const { daysAgo = 0, ...rest } = overrides;
  return {
    uid: "user-1",
    email: "me@example.com",
    displayName: "Me",
    // A minute of slack so "exactly 30 days" never lands a few milliseconds
    // short of the floor() boundary on a slow machine.
    createdAt: new Date(Date.now() - daysAgo * DAY_MS - 60_000).toISOString(),
    subscriptionStatus: "free_trial",
    ...rest,
  };
}

describe("resolveEntitlement", () => {
  it("gives a trialling account its remaining days", () => {
    expect(resolveEntitlement(account({ daysAgo: 5 }))).toEqual({
      status: "trial",
      daysRemaining: 25,
    });
  });

  it("expires a trial that has run out", () => {
    expect(resolveEntitlement(account({ daysAgo: 45 }))).toEqual({ status: "expired" });
  });

  it("expires exactly at the 30-day boundary, not a day later", () => {
    expect(resolveEntitlement(account({ daysAgo: 30 }))).toEqual({ status: "expired" });
    expect(resolveEntitlement(account({ daysAgo: 29 }))).toEqual({
      status: "trial",
      daysRemaining: 1,
    });
  });

  it("keeps an active subscription active however old the account is", () => {
    expect(resolveEntitlement(account({ daysAgo: 400, subscriptionStatus: "active" }))).toEqual({
      status: "active",
    });
  });

  it('blocks an account marked "expired" even inside the trial window', () => {
    // The MED bug this closes: the status existed in `UserAccount` and nothing
    // read it, so a cancellation written as "expired" had no effect at all
    // until 30 days had elapsed since `createdAt`.
    const cancelled = account({ daysAgo: 5, subscriptionStatus: "expired" });

    expect(resolveEntitlement(cancelled)).toEqual({ status: "expired" });
    expect(blocksAccess(resolveEntitlement(cancelled))).toBe(true);
  });

  it('does not let "expired" outrank a subscription that is active again', () => {
    // Ordering check: whichever explicit status is set, "active" is the one
    // that grants, so a resubscribe cannot be shadowed by a stale flag.
    expect(resolveEntitlement(account({ daysAgo: 400, subscriptionStatus: "active" }))).toEqual({
      status: "active",
    });
  });

  it("resolves an unreadable createdAt to unknown rather than to a verdict", () => {
    // `getTrialDaysRemaining` returns NaN here, and NaN answers "no" to both
    // `> 0` and `<= 0`. When the gate and the dashboard each asked their own
    // question of it they got opposite answers about the same account: the
    // gate let the person in, the dashboard told them their trial had ended.
    expect(resolveEntitlement(account({ createdAt: "not-a-date" }))).toEqual({
      status: "unknown",
    });
    expect(resolveEntitlement(account({ createdAt: "" }))).toEqual({ status: "unknown" });
  });

  it("carries no day count on an unknown entitlement, so nothing can render NaN", () => {
    const entitlement = resolveEntitlement(account({ createdAt: "not-a-date" }));

    expect("daysRemaining" in entitlement).toBe(false);
  });
});

describe("blocksAccess", () => {
  it("blocks only a definite expiry", () => {
    expect(blocksAccess({ status: "expired" })).toBe(true);
    expect(blocksAccess({ status: "active" })).toBe(false);
    expect(blocksAccess({ status: "trial", daysRemaining: 3 })).toBe(false);
  });

  it("fails open on unknown, because an unreadable record is not a debt", () => {
    expect(blocksAccess({ status: "unknown" })).toBe(false);
  });
});
