import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { getWeeklySummary } from "@/lib/browser-checkins";
import { getFirebaseAuth } from "@/lib/firebase";
import { FOCUS_AREAS, type FocusArea } from "@/lib/plan";

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: vi.fn(() => null),
  getFirebaseFirestore: vi.fn(() => null),
}));

const emptyByFocus: Record<FocusArea, { done: number; skipped: number }> = Object.fromEntries(
  FOCUS_AREAS.map((focusArea) => [focusArea, { done: 0, skipped: 0 }]),
) as Record<FocusArea, { done: number; skipped: number }>;

vi.mock("@/lib/browser-checkins", () => ({
  addCheckin: vi.fn(),
  getWeeklySummary: vi.fn(() => ({
    windowStart: "2026-06-21",
    windowEnd: "2026-06-27",
    total: 0,
    done: 0,
    skipped: 0,
    completionRate: 0,
    byFocus: emptyByFocus,
  })),
}));

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    (window as unknown as { __ANIMATE_COUNTERS__?: boolean }).__ANIMATE_COUNTERS__ = false;
    vi.useRealTimers();
    // Dashboard tests run under prefers-reduced-motion so the today progress
    // ring renders its final value instantly instead of animating.
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

  it("shows dashboard framing and loop navigation", async () => {
    window.localStorage.setItem("calm-daily-coach:plan-interest", "pro");
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );
    render(<Home />);

    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Today-first coaching")).toBeTruthy();
    expect(screen.getByText("Dashboard - Focus - Execute - Review - Dashboard")).toBeTruthy();
    expect(screen.getByText("Action rail")).toBeTruthy();
    expect(screen.getByText("Ready to start")).toBeTruthy();
    expect(screen.getByText("Membership")).toBeTruthy();
    expect(screen.getByText("Your coach plan")).toBeTruthy();
    expect(screen.getByText("Sign in to start your 30-day trial")).toBeTruthy();
    expect(screen.getByText("Workspace insights")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Start today's session" }).getAttribute("href")).toBe("/focus");
      expect(screen.getByRole("link", { name: "Start a fresh plan" }).getAttribute("href")).toBe("/focus");
      expect(screen.getByRole("link", { name: "Start focus" }).getAttribute("href")).toBe("/focus");
      expect(screen.getByRole("link", { name: "Generate plan" }).getAttribute("href")).toBe("/focus");
      expect(screen.getByRole("link", { name: "Preview reflection" }).getAttribute("href")).toBe("/review");
      expect(screen.getByRole("link", { name: "Manage plan" }).getAttribute("href")).toBe("/pricing");
      expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeTruthy();
    });
  });

  it("keeps onboarding closed once a real preference record exists", () => {
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );

    render(<Home />);

    expect(screen.queryByTestId("onboarding-container")).toBeNull();
  });

  // The gate used to be a bare truthiness check on the raw stored string, so
  // any leftover value counted as a finished onboarding. Nothing in the app
  // reopens onboarding, and the planner silently falls back to its own
  // defaults for a record it cannot parse, so a corrupt value left a person
  // permanently onboarded-with-nothing.
  it("reopens onboarding for a record it cannot read, instead of counting it as done", () => {
    window.localStorage.setItem("calm-daily-coach:onboarding", "not json at all");

    render(<Home />);

    expect(screen.getByTestId("onboarding-container")).toBeTruthy();
  });

  it("reopens onboarding for a record that is missing preferences", () => {
    window.localStorage.setItem("calm-daily-coach:onboarding", JSON.stringify({ defaultDose: "light" }));

    render(<Home />);

    expect(screen.getByTestId("onboarding-container")).toBeTruthy();
  });

  it("records a complete preference record when onboarding is skipped", async () => {
    window.localStorage.setItem("calm-daily-coach:onboarding", "not json at all");

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-container")).toBeNull();
    });
    expect(JSON.parse(window.localStorage.getItem("calm-daily-coach:onboarding") ?? "null")).toEqual({
      defaultFocus: "Deep Work",
      defaultDose: "light",
      defaultTheme: "dark",
    });
  });

  it("shows onboarding health conversion status from local funnel events", async () => {
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );
    window.localStorage.setItem(
      "calm-daily-coach:monetization-events",
      JSON.stringify([
        {
          name: "onboarding_started",
          tier: "free",
          source: "onboarding",
          timestamp: "2026-06-27T12:00:00.000Z",
        },
        {
          name: "onboarding_completed",
          tier: "free",
          source: "onboarding",
          detail: "step_1:balanced",
          timestamp: "2026-06-27T12:01:00.000Z",
        },
      ]),
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText("Strong completion")).toBeTruthy();
      expect(screen.getByText("100%")).toBeTruthy();
    });
  });

  it("renders a calm zero-state today progress ring before any plan exists", async () => {
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Today's progress: 0 percent" })).toBeTruthy();
      expect(screen.getByText("Today's progress")).toBeTruthy();
      // Zero state stays inviting: neutral ring plus a gentle label, no alarm.
      expect(screen.getByText("A calm start is ready whenever you are.")).toBeTruthy();
      // Under the stubbed prefers-reduced-motion the value is already final.
      expect(screen.getByTestId("progress-text").textContent).toBe("0%");
    });
  });

  it("shows active-cycle link to Execute when a plan already exists", async () => {
    const today = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(
      "calm-daily-coach:guest",
      JSON.stringify({
        focus: "Deep Work",
        dose: "medium",
        notes: "Keep momentum",
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
      }),
    );

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Continue today's session" }).getAttribute("href")).toBe("/execute");
      expect(screen.getAllByText("Plan ready")).toHaveLength(2);
      expect(screen.getByText("Run your active plan, then mark the day done or skipped.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Tune focus" }).getAttribute("href")).toBe("/focus");
      expect(screen.getByRole("link", { name: "Open execute" }).getAttribute("href")).toBe("/execute");
      // The today ring reflects the plan-in-progress half of the daily loop.
      expect(screen.getByRole("img", { name: "Today's progress: 50 percent" })).toBeTruthy();
      expect(screen.getByTestId("progress-text").textContent).toBe("50%");
      expect(screen.getByText("Plan in motion. Move at your own pace.")).toBeTruthy();
    });
  });

  it("keeps the today ring at 100 percent after a reload once a check-in was submitted (regression)", async () => {
    // Regression test for the backlog bug: checkinStatus used to live only in
    // useState, so the ring's 100 percent state never survived a reload. Here
    // we seed localStorage exactly as a real reload would leave it after a
    // prior submitCheckin("done") call (see planner-state.ts's checkedIn
    // field), then render a brand-new Home mount and confirm the ring reads
    // 100 percent immediately, without ever calling submitCheckin in-session.
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

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Open today's reflection" }).getAttribute("href")).toBe("/review");
      expect(screen.getByRole("img", { name: "Today's progress: 100 percent" })).toBeTruthy();
      expect(screen.getByTestId("progress-text").textContent).toBe("100%");
      expect(screen.getByText("Today's loop is complete. Nothing more is asked of you.")).toBeTruthy();
    });
  });

  it("surfaces reminder settings on the dashboard and persists the guest opt-in", async () => {
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );

    render(<Home />);

    expect(screen.getByText("Reminders")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable a daily reminder" }));

    await waitFor(() => {
      expect(screen.getByText("Daily at 18:00")).toBeTruthy();
    });
    expect(
      JSON.parse(window.localStorage.getItem("calm-daily-coach:reminder-prefs:guest") ?? "{}"),
    ).toMatchObject({ enabled: true, time: "18:00", channel: "browser" });
  });

  it("shows account mode and auth configuration warning when Firebase auth is unavailable", async () => {
    vi.mocked(getFirebaseAuth).mockReturnValue(null);

    render(<Home />);

    expect(screen.getByText("Account Mode")).toBeTruthy();
    expect(
      screen.getByText(
        "Google login is not configured yet. Add Firebase environment variables to enable it.",
      ),
    ).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Weekly completion trend")).toBeTruthy();
    });
  });

  it("renders weekly summary metrics and focus breakdown", async () => {
    vi.mocked(getWeeklySummary).mockReturnValue({
      windowStart: "2026-06-21",
      windowEnd: "2026-06-27",
      total: 5,
      done: 4,
      skipped: 1,
      completionRate: 0.8,
      byFocus: {
        ...emptyByFocus,
        Fitness: { done: 3, skipped: 0 },
        Learning: { done: 1, skipped: 0 },
        Sleep: { done: 0, skipped: 1 },
      },
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText("Weekly summary")).toBeTruthy();
      expect(screen.getByRole("img", { name: "Weekly completion 80%" })).toBeTruthy();
      expect(screen.getByText(/Top focus: Fitness/)).toBeTruthy();
      expect(screen.getByRole("img", { name: "Fitness completion 100%" })).toBeTruthy();
    });
  });

  it("counts weekly summary values up to the final totals", async () => {
    (window as unknown as { __ANIMATE_COUNTERS__?: boolean }).__ANIMATE_COUNTERS__ = true;
    vi.useFakeTimers();
    vi.mocked(getWeeklySummary).mockReturnValue({
      windowStart: "2026-06-21",
      windowEnd: "2026-06-27",
      total: 8,
      done: 6,
      skipped: 2,
      completionRate: 0.75,
      byFocus: {
        ...emptyByFocus,
        Fitness: { done: 4, skipped: 0 },
        "Deep Work": { done: 2, skipped: 1 },
        Sleep: { done: 0, skipped: 1 },
      },
    });

    render(<Home />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("weekly-total-count").textContent).toBe("0");
    expect(screen.getByTestId("weekly-done-count").textContent).toBe("0");
    expect(screen.getByTestId("weekly-skipped-count").textContent).toBe("0");
    expect(screen.getByTestId("weekly-completion-percent").textContent).toBe("0%");

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId("weekly-total-count").textContent).toBe("8");
    expect(screen.getByTestId("weekly-done-count").textContent).toBe("6");
    expect(screen.getByTestId("weekly-skipped-count").textContent).toBe("2");
    expect(screen.getByTestId("weekly-completion-percent").textContent).toBe("75%");

    vi.useRealTimers();
  });
});
