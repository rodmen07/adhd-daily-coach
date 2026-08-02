import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewPage from "@/app/review/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { useCoachPlanner } from "@/app/hooks/use-coach-planner";
import { listCheckins } from "@/lib/browser-checkins";
import { getFirestoreCheckinsInRange } from "@/lib/firestore-checkins";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";
import type { BrowserCheckin } from "@/lib/browser-checkins";

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
}));

vi.mock("@/app/hooks/use-coach-planner", () => ({
  useCoachPlanner: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => null),
}));

/** One switch for both halves of the v0.19 PR3 surface: the sync config
 * probe the store factory reads and the lazy client its adapters await. */
function mockFirebase(db: Firestore | null) {
  vi.mocked(isFirebaseConfigured).mockReturnValue(db !== null);
  vi.mocked(loadFirebaseFirestore).mockResolvedValue(db);
}

// Wraps the real browser-checkins implementation instead of replacing it, so
// the review page's own CheckinStoreAdapter still resolves check-in history
// through the real local range reader in the guest tests, while the
// adapter-bypass regression test can track whether listCheckins - the exact
// function the review/page.tsx bug used to call directly - is ever invoked.
vi.mock("@/lib/browser-checkins", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/browser-checkins")>();
  return {
    ...actual,
    listCheckins: vi.fn(actual.listCheckins),
  };
});

vi.mock("@/lib/firestore-checkins", () => ({
  addFirestoreCheckin: vi.fn(),
  getFirestoreWeeklySummary: vi.fn(),
  getFirestoreCheckinsInRange: vi.fn(),
}));

const authMock = {
  authUser: null,
  authMessage: "",
  authConfigured: false,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

const signedInAuthMock = {
  authUser: { uid: "user-123", email: "person@example.com" },
  authMessage: "",
  authConfigured: true,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

const basePlannerMock = {
  weeklySummary: null,
  topFocus: null,
  checkinStatus: { type: "idle" },
};

const weeklySummary = {
  windowStart: "2026-07-12",
  windowEnd: "2026-07-18",
  total: 3,
  done: 2,
  skipped: 1,
  completionRate: 0.67,
  byFocus: {
    "Deep Work": { done: 2, skipped: 0 },
    Fitness: { done: 0, skipped: 1 },
  },
};

// UTC calendar-day keys, matching browser-checkins.ts's own date keying, so
// the summary window and the seeded Firestore history stay aligned with the
// review-insights date filters on any real run date.
function utcDateKey(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function firestoreCheckin(partial: Partial<BrowserCheckin>): BrowserCheckin {
  return {
    id: partial.id ?? "1",
    date: partial.date ?? utcDateKey(2),
    focus: partial.focus ?? "Deep Work",
    dose: partial.dose ?? "medium",
    minutes: partial.minutes ?? 15,
    status: partial.status ?? "done",
    skipReason: partial.skipReason,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

describe("Review page empty state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFirebase(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a calm empty state before the first check-in", () => {
    vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
    vi.mocked(useCoachPlanner).mockReturnValue(basePlannerMock as never);

    render(<ReviewPage />);

    expect(screen.getByTestId("empty-state-insights")).toBeTruthy();
    expect(screen.getByText("Your insights are still sprouting")).toBeTruthy();
    expect(
      screen.getByText(
        "Complete at least one check-in to unlock weekly insights. One calm session is all it takes to begin.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set today's focus" }).getAttribute("href")).toBe(
      "/focus",
    );
    expect(screen.queryByText("Weekly summary")).toBeNull();
  });

  it("replaces the empty state with insights once a summary exists", () => {
    vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
    vi.mocked(useCoachPlanner).mockReturnValue({
      ...basePlannerMock,
      weeklySummary,
      topFocus: "Deep Work",
      checkinStatus: { type: "ok", message: "Great work. Check-in saved." },
    } as never);

    render(<ReviewPage />);

    expect(screen.queryByTestId("empty-state-insights")).toBeNull();
    expect(screen.getByText("Weekly summary")).toBeTruthy();
    expect(screen.getByText("Top focus area")).toBeTruthy();
  });
});

describe("Review page check-in history source", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFirebase(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reads a signed-in user's history through CheckinStoreAdapter so the week-over-week and friction panels see Firestore data", async () => {
    // Regression for the backlog MED bug (filed 2026-07-20): the review page
    // read check-in history via a direct listCheckins(storageScope) call,
    // which only ever hits the LOCAL list. For a signed-in user whose
    // check-ins live in Firestore, that local list is empty, so the "What
    // changed this week" and "friction points" panels silently rendered as if
    // the user had no prior history. Local storage is left empty here to
    // reproduce that exact trap: the panels below can only populate if the
    // page routes through the adapter (which resolves to the mocked Firestore
    // reader), never the direct local call.
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    vi.mocked(useCoachPlanner).mockReturnValue({
      ...basePlannerMock,
      weeklySummary: {
        ...weeklySummary,
        windowStart: utcDateKey(6),
        windowEnd: utcDateKey(0),
      },
      topFocus: "Deep Work",
      checkinStatus: { type: "ok", message: "Great work. Check-in saved." },
    } as never);
    vi.mocked(getFirestoreCheckinsInRange).mockResolvedValue([
      // Prior 7-day window ([windowStart-7, windowStart-1]): drives
      // weekOverWeek.hasPriorData true, so the delta badges render.
      firestoreCheckin({ id: "f-prior", date: utcDateKey(9), focus: "Deep Work", status: "done" }),
      // Current summary window: a skipped check-in with a reason, so the
      // friction-points panel renders.
      firestoreCheckin({
        id: "f-skip",
        date: utcDateKey(2),
        focus: "Fitness",
        status: "skipped",
        skipReason: "interrupted by phone",
      }),
    ]);

    render(<ReviewPage />);

    // Only reachable when prior-window Firestore history reached weekOverWeek.
    const sessionsDelta = await screen.findByTestId("wow-sessions-delta");
    expect(sessionsDelta.textContent).toContain("+1 sessions vs last week");

    // Only reachable when current-window Firestore history reached the
    // skip-reason insights.
    expect(screen.getByText("Analyze & scale local friction points")).toBeTruthy();

    // The fix: history is fetched through the adapter over the 14-day review
    // window, and the direct browser-checkins call is never used.
    expect(vi.mocked(getFirestoreCheckinsInRange)).toHaveBeenCalledWith(
      expect.anything(),
      14,
      undefined,
      "user-123",
    );
    expect(vi.mocked(listCheckins)).not.toHaveBeenCalled();
  });

  it("renders the friction panel from a guest's real local history through the adapter", async () => {
    // Companion to the signed-in case: proves the adapter's local branch still
    // feeds the same panels, so the fix did not silently break the offline /
    // guest path. Seeds through the real addCheckin against localStorage.
    const { addCheckin } = await import("@/lib/browser-checkins");
    vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
    vi.mocked(useCoachPlanner).mockReturnValue({
      ...basePlannerMock,
      weeklySummary: {
        ...weeklySummary,
        windowStart: utcDateKey(6),
        windowEnd: utcDateKey(0),
      },
      topFocus: "Deep Work",
      checkinStatus: { type: "ok", message: "Great work. Check-in saved." },
    } as never);

    addCheckin(
      {
        date: utcDateKey(1),
        focus: "Fitness",
        dose: "light",
        minutes: 5,
        status: "skipped",
        skipReason: "ran out of time",
      },
      "guest",
    );

    render(<ReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Analyze & scale local friction points")).toBeTruthy();
    });
    expect(vi.mocked(getFirestoreCheckinsInRange)).not.toHaveBeenCalled();
  });
});
