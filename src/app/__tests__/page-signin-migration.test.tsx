import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { getInitialPlannerState } from "@/lib/planner-state";
import { addCheckin } from "@/lib/browser-checkins";
import { addFirestoreCheckin } from "@/lib/firestore-checkins";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";

// v0.17 PR2 "Sign-in keeps your workspace": the dashboard ring must NOT reset
// at the moment sign-in resolves. These are wiring proofs through the rendered
// page, not restatements of planner-state.test.ts's migration coverage:
// Firebase never enters (the lib is mocked to its not-configured state, which
// also pins every store to the local backend), the auth hook is mocked the
// way slicer-page.test.tsx established for PR1, and both scopes live in real
// jsdom localStorage so the copy is observable end to end.

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => null),
}));

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
}));

// v0.28 only: the cloud half of the check-in store, so a signed-in load can be
// given a THROWING cloud write and the local fallback observed end to end.
// The v0.17 tests above never reach it - Firebase stays unconfigured there,
// which pins every store to the local backend.
vi.mock("@/lib/firestore-checkins", () => ({
  addFirestoreCheckin: vi.fn(),
  getFirestoreWeeklySummary: vi.fn(async () => {
    throw new Error("not used");
  }),
  getFirestoreCheckinsInRange: vi.fn(async () => []),
}));

const guestAuth = {
  authUser: null,
  authMessage: "",
  authConfigured: false,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

function signIn(uid = "user-123") {
  vi.mocked(useCoachAuth).mockReturnValue({
    ...guestAuth,
    authUser: { uid, email: "person@example.com", displayName: "Person" },
  } as never);
}

function seedGuestCheckedInDay(): string {
  const today = new Date().toISOString().slice(0, 10);
  window.localStorage.setItem(
    "calm-daily-coach:guest",
    JSON.stringify({
      focus: "Deep Work",
      dose: "medium",
      notes: "",
      email: "",
      plan: {
        date: today,
        focus: "Deep Work",
        dose: "medium",
        minutes: 15,
        action: "Run one 15-minute focus block with zero context switching.",
        reflection: "What interrupted your focus, and how will you prevent it tomorrow?",
        optionalResource: "Optional: Use a single-task timer for your next block.",
        capMessage: "You reached today's plan. See you tomorrow.",
      },
      checkedIn: { date: today, status: "done" },
    }),
  );
  return today;
}

describe("Dashboard ring across sign-in (v0.17 PR2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );
    (window as unknown as { __ANIMATE_COUNTERS__?: boolean }).__ANIMATE_COUNTERS__ = false;
    vi.useRealTimers();
    vi.mocked(useCoachAuth).mockReturnValue(guestAuth as never);
    // Reduced motion, so the today ring renders its final value instantly.
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

  it("keeps the ring at 100 percent when sign-in resolves on an already-open page", async () => {
    const today = seedGuestCheckedInDay();

    const { rerender } = render(<Home />);

    // Mounted as a guest: the completed day renders from the guest scope.
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Today's progress: 100 percent" })).toBeTruthy();
    });

    // Sign-in resolves underneath the open page. The next render re-keys
    // planner storage to the account scope, which before this milestone is
    // the exact moment a guest's completed day dropped back to 50 percent.
    signIn();
    rerender(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Today's progress: 100 percent" })).toBeTruthy();
      expect(screen.getByTestId("progress-text").textContent).toBe("100%");
    });

    // The copy is real state, not a lingering render: the account scope now
    // holds today's record, and the guest copy is never deleted (D4).
    expect(getInitialPlannerState("user-123").checkedIn).toEqual({ date: today, status: "done" });
    expect(getInitialPlannerState("guest").checkedIn).toEqual({ date: today, status: "done" });
  });

  it("reads 100 percent on the first signed-in load after a guest check-in", async () => {
    const today = seedGuestCheckedInDay();
    signIn();

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Today's progress: 100 percent" })).toBeTruthy();
    });
    // The one calm line the design allows for this outcome (D5).
    expect(screen.getByText("Brought today's plan along to your account.")).toBeTruthy();
    expect(getInitialPlannerState("user-123").checkedIn).toEqual({ date: today, status: "done" });
  });
});

// v0.28 (docs/design/MIGRATION_DESTINATION.md). `/` is the surface that made
// the explicit claim - "Migrated N guest check-ins to your account." - on a
// copy that never left the browser. These are wiring proofs through the
// rendered page: the store is firestore-RESOLVED, its cloud write throws, and
// the local retry succeeds, which is the exact live shape of the defect.
describe("A guest copy that lands in this browser says so on / (v0.28)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );
    (window as unknown as { __ANIMATE_COUNTERS__?: boolean }).__ANIMATE_COUNTERS__ = false;
    vi.mocked(useCoachAuth).mockReturnValue(guestAuth as never);
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

  /** Firebase present and a client available, so the store resolves firestore. */
  function cloudConfigured() {
    vi.mocked(isFirebaseConfigured).mockReturnValue(true);
    vi.mocked(loadFirebaseFirestore).mockResolvedValue({} as Firestore);
  }

  it("renders a calm notice instead of the account claim", async () => {
    addCheckin(
      { date: "2026-08-09", focus: "Deep Work", dose: "light", minutes: 5, status: "done" },
      "guest",
    );
    cloudConfigured();
    vi.mocked(addFirestoreCheckin).mockRejectedValue(new Error("permission-denied"));
    signIn();

    render(<Home />);

    const note = await screen.findByTestId("checkin-migration-local");
    // Composed from a literal, never from the module the page imports.
    expect(note.textContent).toBe(
      "Your earlier check-ins are safe in this browser. They will be copied to your account next time it can be reached.",
    );
    // D4: a notice waits for a pause in the reading order; only an error
    // claims the alert role.
    expect(note.getAttribute("role")).toBeNull();
    expect(note.getAttribute("aria-live")).toBe("polite");
    expect(note.className).toContain("text-amber-700");
    // The sentence this replaces is gone, and no error appeared either.
    expect(screen.queryByTestId("checkin-migration-note")).toBeNull();
    expect(screen.queryByTestId("checkin-migration-error")).toBeNull();
    expect(screen.queryByText(/Migrated 1 guest check-in to your account\./)).toBeNull();
  });

  it("still says 'to your account' when the copy really reached it", async () => {
    // The other half of the behaviour difference: with the cloud write
    // working, nothing about the old sentence changes.
    addCheckin(
      { date: "2026-08-09", focus: "Deep Work", dose: "light", minutes: 5, status: "done" },
      "guest",
    );
    cloudConfigured();
    vi.mocked(addFirestoreCheckin).mockResolvedValue(undefined);
    signIn();

    render(<Home />);

    const note = await screen.findByTestId("checkin-migration-note");
    expect(note.textContent).toBe("Migrated 1 guest check-in to your account.");
    expect(note.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByTestId("checkin-migration-local")).toBeNull();
  });
});
