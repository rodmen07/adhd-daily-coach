import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import {
  getTrialDaysRemaining,
  getUserAccount,
  upsertUserAccount,
} from "@/lib/firestore-user";

/**
 * First coverage for `firestore-user.ts`, shipped 2026-07-02 and untested until
 * now. It is the account record and the trial arithmetic that
 * `SubscriptionGuard` gates the whole app on, so a silent change here changes
 * who can use the product.
 *
 * The `firebase/firestore` client SDK is mocked directly (the
 * `firestore-journal.test.ts` convention) so the real function bodies run.
 */

const mockDoc = vi.fn<(...args: unknown[]) => { path: string }>(() => ({
  path: "users/user-1",
}));
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS - 60_000).toISOString();
}

function existingDoc(data: Record<string, unknown>) {
  return { exists: () => true, data: () => data };
}

const missingDoc = { exists: () => false, data: () => undefined };

describe("getTrialDaysRemaining", () => {
  it("gives a brand-new account the full 30 days", () => {
    expect(getTrialDaysRemaining(new Date().toISOString())).toBe(30);
  });

  it("counts elapsed whole days down from 30", () => {
    expect(getTrialDaysRemaining(isoDaysAgo(10))).toBe(20);
    expect(getTrialDaysRemaining(isoDaysAgo(29))).toBe(1);
  });

  it("reaches 0 exactly at the 30-day boundary", () => {
    expect(getTrialDaysRemaining(isoDaysAgo(30))).toBe(0);
  });

  it("clamps at 0 rather than going negative long after the trial", () => {
    expect(getTrialDaysRemaining(isoDaysAgo(400))).toBe(0);
  });

  it("returns NaN for a malformed date, not the documented 0", () => {
    // DOCUMENTS A DEFECT (backlog `## Bugs`, LOW, filed not fixed): the
    // function's `catch { return 0 }` is unreachable - `new Date("nope")` and
    // `.getTime()` yield NaN rather than throwing - so a corrupt `createdAt`
    // produces NaN, which `Math.max` propagates. It is pinned rather than
    // "fixed" because returning 0 would mean "trial finished", i.e. changing it
    // would LOCK OUT every account with a bad date. Any caller that renders
    // "N days left" would print "NaN days left" today.
    expect(Number.isNaN(getTrialDaysRemaining("not-a-date"))).toBe(true);
    expect(Number.isNaN(getTrialDaysRemaining(""))).toBe(true);
  });
});

describe("upsertUserAccount", () => {
  const db = {} as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
  });

  it("creates a trialling account for a first-time user", async () => {
    mockGetDoc.mockResolvedValueOnce(missingDoc);

    const account = await upsertUserAccount(db, "user-1", "me@example.com", "Me");

    expect(mockDoc).toHaveBeenCalledWith(db, "users", "user-1");
    expect(account.subscriptionStatus).toBe("free_trial");
    expect(account.uid).toBe("user-1");
    expect(Number.isNaN(Date.parse(account.createdAt))).toBe(false);
    // Written whole, not merged: a new account has nothing to preserve.
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc.mock.calls[0][1]).toEqual(account);
    expect(mockSetDoc.mock.calls[0][2]).toBeUndefined();
  });

  it("never resets an existing account's trial start or subscription", async () => {
    // The gate blocks on `createdAt`, so an upsert that overwrote it would hand
    // every returning subscriber a fresh 30-day trial, and one that overwrote
    // `subscriptionStatus` would drop a paying person back to the trial.
    const createdAt = isoDaysAgo(120);
    mockGetDoc.mockResolvedValueOnce(
      existingDoc({
        uid: "user-1",
        email: "old@example.com",
        displayName: "Old name",
        createdAt,
        subscriptionStatus: "active",
      }),
    );

    const account = await upsertUserAccount(db, "user-1", "new@example.com", "New name");

    expect(account.createdAt).toBe(createdAt);
    expect(account.subscriptionStatus).toBe("active");
    expect(account.email).toBe("new@example.com");
    expect(account.displayName).toBe("New name");
  });

  it("merges the profile update so unknown stored fields survive", async () => {
    mockGetDoc.mockResolvedValueOnce(
      existingDoc({
        uid: "user-1",
        email: "old@example.com",
        displayName: "Old name",
        createdAt: isoDaysAgo(3),
        subscriptionStatus: "free_trial",
        stripeCustomerId: "cus_123",
      }),
    );

    await upsertUserAccount(db, "user-1", "new@example.com", "New name");

    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
    expect(mockSetDoc.mock.calls[0][1]).toMatchObject({
      stripeCustomerId: "cus_123",
      email: "new@example.com",
      displayName: "New name",
    });
  });

  it("repairs a stored record that is missing its trial fields", async () => {
    mockGetDoc.mockResolvedValueOnce(
      existingDoc({ uid: "user-1", email: "me@example.com", displayName: "Me" }),
    );

    const account = await upsertUserAccount(db, "user-1", "me@example.com", "Me");

    expect(account.subscriptionStatus).toBe("free_trial");
    expect(getTrialDaysRemaining(account.createdAt)).toBe(30);
  });

  it("accepts an account with no display name", async () => {
    mockGetDoc.mockResolvedValueOnce(missingDoc);

    const account = await upsertUserAccount(db, "user-1", "me@example.com", null);

    expect(account.displayName).toBeNull();
  });
});

describe("getUserAccount", () => {
  const db = {} as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stored account when the document exists", async () => {
    const stored = {
      uid: "user-1",
      email: "me@example.com",
      displayName: "Me",
      createdAt: isoDaysAgo(2),
      subscriptionStatus: "free_trial",
    };
    mockGetDoc.mockResolvedValueOnce(existingDoc(stored));

    expect(await getUserAccount(db, "user-1")).toEqual(stored);
  });

  it("returns null rather than a partial account when there is no document", async () => {
    mockGetDoc.mockResolvedValueOnce(missingDoc);

    expect(await getUserAccount(db, "user-1")).toBeNull();
  });
});
