import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { getInitialPlannerState } from "@/lib/planner-state";

// v0.17 PR2 "Sign-in keeps your workspace": the dashboard ring must NOT reset
// at the moment sign-in resolves. These are wiring proofs through the rendered
// page, not restatements of planner-state.test.ts's migration coverage:
// Firebase never enters (the lib is mocked to its not-configured state, which
// also pins every store to the local backend), the auth hook is mocked the
// way slicer-page.test.tsx established for PR1, and both scopes live in real
// jsdom localStorage so the copy is observable end to end.

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: vi.fn(() => null),
  getFirebaseFirestore: vi.fn(() => null),
}));

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
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
