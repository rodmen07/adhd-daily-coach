import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionGuard } from "@/app/components/subscription-guard";
import type { UserAccount } from "@/lib/firestore-user";

/**
 * First coverage for `SubscriptionGuard`, the app's authorization boundary.
 *
 * `layout.tsx:79` wraps EVERY route in this component, so it alone decides
 * whether any page renders at all. It shipped 2026-07-02 and had no dedicated
 * test until now: the only file that referenced it (`layout.test.tsx:17`)
 * mocks it out to a pass-through, and every page test mounts its page
 * directly, so no test in the suite had ever rendered the real gate.
 *
 * These tests pin the gate's REAL current behavior rather than the behavior
 * the surrounding product assumes. Three of them documented defects that were
 * filed in the backlog's `## Bugs` section rather than fixed here, because
 * changing who may reach the app is a product decision, not a QA call. Each
 * such test says so on its own line.
 *
 * v0.14 PR1 closed the first - the paywall's only call to action pointed at
 * `/pricing`, which this same gate blocked - so that test now asserts the fix
 * and the group below it pins the exemption's edges. v0.14 PR2a closed the
 * second: an account marked `"expired"` is blocked on its own terms (D5), read
 * through the shared `@/lib/entitlement`. Exactly ONE documenting test is left,
 * the sign-in wall, and it waits on decision D1 rather than on more code.
 */

const mockUseCoachAuth = vi.fn();
vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: () => mockUseCoachAuth(),
}));

const mockGetFirebaseFirestore = vi.fn();
vi.mock("@/lib/firebase", () => ({
  getFirebaseFirestore: () => mockGetFirebaseFirestore(),
}));

// The gate is route-aware as of v0.14 PR1. Mocked the same way `site-nav.test.tsx`
// mocks it, since both read the current route from `usePathname`.
const mockUsePathname = vi.fn<() => string>();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// Partial mock: `upsertUserAccount` is the network call and is stubbed, but
// `getTrialDaysRemaining` stays REAL so the gate's decision is computed by the
// same arithmetic that runs in production.
const mockUpsertUserAccount = vi.fn();
vi.mock("@/lib/firestore-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore-user")>();
  return {
    ...actual,
    upsertUserAccount: (...args: unknown[]) => mockUpsertUserAccount(...args),
  };
});

const DAY_MS = 24 * 60 * 60 * 1000;

const signedInUser = {
  uid: "user-1",
  email: "me@example.com",
  displayName: "Me",
};

function accountCreatedDaysAgo(
  days: number,
  subscriptionStatus: UserAccount["subscriptionStatus"] = "free_trial",
): UserAccount {
  return {
    uid: "user-1",
    email: "me@example.com",
    displayName: "Me",
    // A minute of slack so a test that means "exactly 30 days" never lands a
    // few milliseconds short of the floor() boundary on a slow machine.
    createdAt: new Date(Date.now() - days * DAY_MS - 60_000).toISOString(),
    subscriptionStatus,
  };
}

function authState(overrides: Record<string, unknown> = {}) {
  return {
    authUser: null,
    authConfigured: true,
    authMessage: "",
    signInWithGoogle: vi.fn(),
    signOutUser: vi.fn(),
    ...overrides,
  };
}

/** Stands in for any real page: it renders only if the gate lets it. */
function AppContent() {
  return <p data-testid="app-content">Today&apos;s loop</p>;
}

/** Stands in for what `/pricing` renders, so "did the route get through" is observable. */
function PricingRoute() {
  return <p data-testid="pricing-page">Subscribe for $5/month</p>;
}

describe("SubscriptionGuard", () => {
  beforeEach(() => {
    mockUseCoachAuth.mockReturnValue(authState());
    mockGetFirebaseFirestore.mockReturnValue({});
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(1));
    // Every test that is not about the exemption runs on an ordinary route.
    mockUsePathname.mockReturnValue("/");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockUsePathname.mockReset();
  });

  it("holds the app behind a loading state until the account resolves", () => {
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockReturnValue(new Promise(() => {}));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(screen.getByText("Loading account details...")).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("shows a signed-out visitor the sign-in wall instead of the page, on every gated route", async () => {
    // DOCUMENTS A DEFECT (backlog `## Bugs`, HIGH, filed not fixed): there is no
    // guest mode. The rest of the product is local-first by design - the stores
    // resolve to localStorage when signed out, and v0.13 exists to migrate data
    // a person created "signed out" into their account - but this gate renders
    // nothing at all until a Google account exists, so that data can never be
    // created on the deployed site. (v0.14 PR1 exempted `/pricing` only; every
    // other route is still walled, which is what this test holds.)
    mockUseCoachAuth.mockReturnValue(authState({ authUser: null }));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByText("Sign in required")).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("still walls the app off when Firebase auth is unconfigured, and says so", async () => {
    // A deployment with no NEXT_PUBLIC_FIREBASE_* values cannot sign anyone in,
    // so this branch is the whole app for that build, not a degraded corner.
    mockUseCoachAuth.mockReturnValue(
      authState({ authUser: null, authConfigured: false }),
    );

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByText("Sign in required")).toBeTruthy();
    expect(
      screen.getByText(/Google login is not configured yet/),
    ).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("announces a sign-in failure in an assertive live region", async () => {
    mockUseCoachAuth.mockReturnValue(
      authState({ authUser: null, authMessage: "Popup blocked. Try again." }),
    );

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Popup blocked. Try again.");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  it("lets a signed-in person through while their trial is still running", async () => {
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(5));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
    expect(screen.queryByText("Your Trial Has Ended")).toBeNull();
  });

  it("lets a person through on the last day of the trial window", async () => {
    // 29 days in, one day left: the boundary is inclusive on this side.
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(29));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
  });

  it("blocks an unsubscribed person once the 30-day trial has finished", async () => {
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(30));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByText("Your Trial Has Ended")).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("lets a subscribed person through long after the trial window closed", async () => {
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(400, "active"));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
    expect(screen.queryByText("Your Trial Has Ended")).toBeNull();
  });

  it("still points a blocked person at /pricing as the one way out", async () => {
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(45));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    const cta = await screen.findByRole("link", { name: /subscribe for \$5\/month/i });
    expect(cta.getAttribute("href")).toContain("/pricing");
  });

  describe("the /pricing exemption (v0.14 PR1, decision D2)", () => {
    it("lets a blocked account reach /pricing, so the Subscribe link leads somewhere", async () => {
      // CLOSES A FILED BUG (backlog `## Bugs`, HIGH): before the exemption this
      // rendered the trial-ended screen again, i.e. the paywall's only call to
      // action led back to the paywall.
      mockUsePathname.mockReturnValue("/pricing/");
      mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
      mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(45));

      render(
        <SubscriptionGuard>
          <PricingRoute />
        </SubscriptionGuard>,
      );

      expect(await screen.findByTestId("pricing-page")).toBeTruthy();
      expect(screen.queryByText("Your Trial Has Ended")).toBeNull();
    });

    it("matches the trailing-slash pathname the static export actually serves", async () => {
      // `trailingSlash: true` means the live value is "/pricing/", never the
      // "/pricing" the exemption list is written with. An exact-string check
      // would pass every test written with the bare form and fail in production.
      mockUsePathname.mockReturnValue("/pricing/");
      mockUseCoachAuth.mockReturnValue(authState({ authUser: null }));

      render(
        <SubscriptionGuard>
          <PricingRoute />
        </SubscriptionGuard>,
      );

      expect(await screen.findByTestId("pricing-page")).toBeTruthy();
      expect(screen.queryByText("Sign in required")).toBeNull();
    });

    it("renders /pricing immediately instead of holding it behind the account read", async () => {
      // The account promise never settles here. A blocked person clicking
      // Subscribe must not land on an indefinite spinner.
      mockUsePathname.mockReturnValue("/pricing/");
      mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
      mockUpsertUserAccount.mockReturnValue(new Promise(() => {}));

      render(
        <SubscriptionGuard>
          <PricingRoute />
        </SubscriptionGuard>,
      );

      expect(await screen.findByTestId("pricing-page")).toBeTruthy();
      expect(screen.queryByText("Loading account details...")).toBeNull();
    });

    it("exempts that one route only: a blocked account is still blocked everywhere else", async () => {
      // The exemption is a hole punched through the authorization boundary, so
      // the test that matters most is the one proving it is the size it claims.
      mockUsePathname.mockReturnValue("/journal/");
      mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
      mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(45));

      render(
        <SubscriptionGuard>
          <AppContent />
        </SubscriptionGuard>,
      );

      expect(await screen.findByText("Your Trial Has Ended")).toBeTruthy();
      expect(screen.queryByTestId("app-content")).toBeNull();
    });

    it("does not exempt a route that merely starts with the same characters", async () => {
      mockUsePathname.mockReturnValue("/pricing-internal/");
      mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
      mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(45));

      render(
        <SubscriptionGuard>
          <AppContent />
        </SubscriptionGuard>,
      );

      expect(await screen.findByText("Your Trial Has Ended")).toBeTruthy();
    });
  });

  it('blocks an account marked "expired" even inside the trial window', async () => {
    // Was a documenting test for the MED bug: `UserAccount` declared three
    // statuses and the gate read only `=== "active"`, so an account explicitly
    // marked expired was indistinguishable from a trialling one until 30 days
    // elapsed. Decision D5 made the status mean what it says; the gate now
    // reads it through `resolveEntitlement`.
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(5, "expired"));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByText("Your Trial Has Ended")).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("still lets an active subscriber in long after the trial window", async () => {
    // The other half of D5's ordering: an explicit status decides, and the one
    // that grants must keep winning over the trial clock.
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(400, "active"));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
    expect(screen.queryByText("Your Trial Has Ended")).toBeNull();
  });

  it("fails open when the account read rejects, rather than showing a paywall", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockRejectedValue(new Error("firestore unavailable"));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
    expect(screen.queryByText("Your Trial Has Ended")).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it("fails open when Firestore is not available at all", async () => {
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockGetFirebaseFirestore.mockReturnValue(null);

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
    expect(mockUpsertUserAccount).not.toHaveBeenCalled();
  });

  it("fails open on a malformed createdAt instead of locking the person out", async () => {
    // `getTrialDaysRemaining("")` returns NaN (see firestore-user.test.ts), and
    // `NaN <= 0` is false, so a corrupt record used to read as "trial not
    // finished" - the safe direction, but reached by accident, which is why it
    // was pinned here. As of v0.14 PR2a it is deliberate: `resolveEntitlement`
    // maps a non-finite day count to an `unknown` entitlement, and only a
    // definite `expired` blocks. Any change that makes the trial math return 0
    // for a bad date, or that makes `unknown` block, would silently start
    // locking those accounts out.
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue({
      uid: "user-1",
      email: "me@example.com",
      displayName: "Me",
      createdAt: "",
      subscriptionStatus: "free_trial",
    } satisfies UserAccount);

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
  });
});
