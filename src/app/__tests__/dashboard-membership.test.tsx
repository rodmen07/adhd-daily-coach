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
 *
 * `firebase/firestore` is stubbed for a TIMING reason, not a behavioural one,
 * and the last test in this file guards it. This is the only suite that flips
 * `isFirebaseConfigured` to true while keeping the planner's check-in store
 * REAL, so the store resolves its firestore backend and the real
 * `@/lib/firestore-checkins` bodies run - and their first act is
 * `await import("firebase/firestore")`, the real SDK. Compiling that chunk is
 * a ~250-400ms SYNCHRONOUS block that the ESM loader schedules AFTER the
 * first test's assertion has already resolved, so it lands inside the SECOND
 * test's 5000ms budget (measured with an in-test CPU profile: the stall window
 * is `compileSourceTextModule`/`wrapSafe`, and a 10ms interval ticker fired
 * once, at +275ms). Under wave-parallel load that block multiplied past 5000ms
 * and timed the second test out - four independent occurrences filed in the
 * backlog before the mechanism was found, every one of them naming whichever
 * test ran second. Every sibling suite that renders signed-in pages already
 * mocks the `@/lib/firestore-*` modules away; this one stubs the SDK itself so
 * the store's real fallback arithmetic stays under test.
 */

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => ({ type: "firestore" })),
}));

// Every function the real `@/lib/firestore-*` bodies destructure from the SDK.
// Reads resolve empty (matching the empty localStorage each test starts with);
// writes resolve void. The point is that importing this specifier costs
// microseconds instead of a ~300ms synchronous compile of the real SDK.
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  setDoc: vi.fn(async () => undefined),
  addDoc: vi.fn(async () => ({ id: "stub-doc" })),
  collection: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
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

  it("never loads the real firebase/firestore SDK, whose compile cost times out whichever test runs second", async () => {
    // The regression direction is DELETING the `vi.mock("firebase/firestore")`
    // above: the signed-in check-in store then imports the real SDK, and its
    // ~250-400ms synchronous compile lands in the next test's 5000ms budget -
    // the mechanism behind four load-multiplied timeouts of this suite's
    // second test (2026-08-04 through 2026-08-08). `vi.isMockFunction` is the
    // discriminator because it cannot be satisfied by the real module: it
    // answers "who provided this export", not "what is its value".
    const sdk = await import("firebase/firestore");
    expect(vi.isMockFunction(sdk.getDocs)).toBe(true);
    expect(vi.isMockFunction(sdk.addDoc)).toBe(true);
  });
});
