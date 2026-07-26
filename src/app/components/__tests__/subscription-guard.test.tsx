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
 * the surrounding product assumes. Three of them document defects that are
 * filed in the backlog's `## Bugs` section rather than fixed here, because
 * changing who may reach the app is a product decision, not a QA call. Each
 * such test says so on its own line.
 */

const mockUseCoachAuth = vi.fn();
vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: () => mockUseCoachAuth(),
}));

const mockGetFirebaseFirestore = vi.fn();
vi.mock("@/lib/firebase", () => ({
  getFirebaseFirestore: () => mockGetFirebaseFirestore(),
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

describe("SubscriptionGuard", () => {
  beforeEach(() => {
    mockUseCoachAuth.mockReturnValue(authState());
    mockGetFirebaseFirestore.mockReturnValue({});
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(1));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
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

  it("shows a signed-out visitor the sign-in wall instead of the page, on every route", async () => {
    // DOCUMENTS A DEFECT (backlog `## Bugs`, HIGH, filed not fixed): there is no
    // guest mode. The rest of the product is local-first by design - the stores
    // resolve to localStorage when signed out, and v0.13 exists to migrate data
    // a person created "signed out" into their account - but this gate renders
    // nothing at all until a Google account exists, so that data can never be
    // created on the deployed site.
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

  it("sends a blocked person to a subscribe link that this same gate also blocks", async () => {
    // DOCUMENTS A DEFECT (backlog `## Bugs`, HIGH, filed not fixed): the gate has
    // no route awareness, and `/pricing` is `children` like every other route
    // (layout.tsx:79). The paywall's only call to action therefore leads back to
    // the paywall. `PricingRoute` below stands in for what /pricing would render;
    // it is absent for exactly the person the button is aimed at.
    function PricingRoute() {
      return <p data-testid="pricing-page">Subscribe for $5/month</p>;
    }

    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(45));

    render(
      <SubscriptionGuard>
        <PricingRoute />
      </SubscriptionGuard>,
    );

    const cta = await screen.findByRole("link", { name: /subscribe for \$5\/month/i });
    expect(cta.getAttribute("href")).toContain("/pricing");
    expect(screen.queryByTestId("pricing-page")).toBeNull();
  });

  it('ignores the "expired" account status while the trial window is open', async () => {
    // DOCUMENTS A DEFECT (backlog `## Bugs`, MED, filed not fixed): `UserAccount`
    // declares three statuses, and the gate reads only `=== "active"`, so an
    // account explicitly marked expired is indistinguishable from a trialling
    // one until the 30 days elapse. Whether that status should gate access is a
    // product call; today it does nothing.
    mockUseCoachAuth.mockReturnValue(authState({ authUser: signedInUser }));
    mockUpsertUserAccount.mockResolvedValue(accountCreatedDaysAgo(5, "expired"));

    render(
      <SubscriptionGuard>
        <AppContent />
      </SubscriptionGuard>,
    );

    expect(await screen.findByTestId("app-content")).toBeTruthy();
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
    // `NaN <= 0` is false, so a corrupt record reads as "trial not finished".
    // That direction is the safe one and matches the gate's stated fail-open
    // intent, but it is arrived at by accident, so it is pinned here: any change
    // that makes the trial math return 0 for a bad date would silently start
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
