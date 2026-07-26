import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { getUserAccount } from "@/lib/firestore-user";
import type { UserAccount } from "@/lib/firestore-user";

/**
 * The dashboard's membership card, for a SIGNED-IN person.
 *
 * `page.test.tsx` renders the dashboard signed out, so the card's other four
 * states had never been rendered by a test even though they read the same
 * account record the authorization gate blocks on. Those two used to compute
 * entitlement separately - the gate from `isSubscribed`/`isTrialFinished`, this
 * card from its own `daysLeft > 0` - and a malformed `createdAt` made them
 * disagree out loud: the gate let the person in while this card told them
 * "Trial ended - membership required". Both now read `resolveEntitlement`, and
 * these tests are what proves this consumer is really wired to it.
 *
 * `getUserAccount` is stubbed (it is the network call) but the trial arithmetic
 * and `resolveEntitlement` stay REAL, so the card under test is driven by the
 * same computation production runs.
 */

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: vi.fn(() => null),
  getFirebaseFirestore: vi.fn(() => ({ type: "firestore" })),
}));

const signedInUser = { uid: "user-1", email: "me@example.com", displayName: "Me" };

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: () => ({
    authUser: signedInUser,
    authMessage: null,
    authConfigured: true,
    signInWithGoogle: vi.fn(),
    signOutUser: vi.fn(),
  }),
}));

vi.mock("@/lib/firestore-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore-user")>();
  return {
    ...actual,
    getUserAccount: vi.fn(),
  };
});

// `@/lib/browser-checkins` is deliberately NOT mocked: this file asserts the
// membership card only, and the check-in store is local-first, so the real
// module reads the empty localStorage each test starts with.
const mockGetUserAccount = vi.mocked(getUserAccount);

const DAY_MS = 24 * 60 * 60 * 1000;

function account(overrides: Partial<UserAccount> & { daysAgo?: number } = {}): UserAccount {
  const { daysAgo = 0, ...rest } = overrides;
  return {
    uid: "user-1",
    email: "me@example.com",
    displayName: "Me",
    createdAt: new Date(Date.now() - daysAgo * DAY_MS - 60_000).toISOString(),
    subscriptionStatus: "free_trial",
    ...rest,
  };
}

describe("Dashboard membership card, signed in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    (window as unknown as { __ANIMATE_COUNTERS__?: boolean }).__ANIMATE_COUNTERS__ = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("counts down a trial in progress", async () => {
    mockGetUserAccount.mockResolvedValue(account({ daysAgo: 5 }));

    render(<Home />);

    expect(await screen.findByText("25 days left in trial")).toBeTruthy();
  });

  it("says the membership is active for a subscriber", async () => {
    mockGetUserAccount.mockResolvedValue(account({ daysAgo: 400, subscriptionStatus: "active" }));

    render(<Home />);

    expect(await screen.findByText("Membership active")).toBeTruthy();
  });

  it('reports an account marked "expired" as ended, not as still trialling', async () => {
    // Before D5 this card read only `=== "active"` and then fell through to the
    // trial clock, so a cancelled account five days old was advertised as
    // "25 days left in trial" while the gate let it straight through.
    mockGetUserAccount.mockResolvedValue(account({ daysAgo: 5, subscriptionStatus: "expired" }));

    render(<Home />);

    expect(await screen.findByText("Trial ended - membership required")).toBeTruthy();
    expect(screen.queryByText("25 days left in trial")).toBeNull();
  });

  it("does not claim a trial ended when it simply cannot read the date", async () => {
    // The contradiction that justified one shared decision: NaN answers "no" to
    // every comparison, so the gate (`NaN <= 0`) admitted this person while
    // this card (`NaN > 0`) told them their trial was over and a membership was
    // required. `unknown` now says the true thing, and carries no day count, so
    // "NaN days left in trial" cannot be rendered either.
    mockGetUserAccount.mockResolvedValue(account({ createdAt: "not-a-date" }));

    render(<Home />);

    expect(await screen.findByText("Membership status unavailable - access is unchanged")).toBeTruthy();
    expect(screen.queryByText("Trial ended - membership required")).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
