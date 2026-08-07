import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { getWeeklySummary } from "@/lib/browser-checkins";
import { isFirebaseConfigured } from "@/lib/firebase";
import { FOCUS_AREAS, type FocusArea } from "@/lib/plan";

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => null),
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

  it("keeps onboarding closed once a real preference record exists", async () => {
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Deep Work", defaultDose: "light", defaultTheme: "dark" }),
    );

    render(<Home />);

    // Let the deferred settle run before asserting absence; asserting straight
    // after render would pass trivially against the pre-settle default.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByTestId("onboarding-container")).toBeNull();
  });

  // The gate used to be a bare truthiness check on the raw stored string, so
  // any leftover value counted as a finished onboarding. Nothing in the app
  // reopens onboarding, and the planner silently falls back to its own
  // defaults for a record it cannot parse, so a corrupt value left a person
  // permanently onboarded-with-nothing.
  it("reopens onboarding for a record it cannot read, instead of counting it as done", async () => {
    window.localStorage.setItem("calm-daily-coach:onboarding", "not json at all");

    render(<Home />);

    expect(await screen.findByTestId("onboarding-container")).toBeTruthy();
  });

  it("reopens onboarding for a record that is missing preferences", async () => {
    window.localStorage.setItem("calm-daily-coach:onboarding", JSON.stringify({ defaultDose: "light" }));

    render(<Home />);

    expect(await screen.findByTestId("onboarding-container")).toBeTruthy();
  });

  // v0.15 PR2 (docs/design/FIRST_RUN.md D5). `showOnboarding` used to be seeded
  // by a `useState` initializer that read localStorage. Under `output: "export"`
  // the prerender has no `window`, so the static HTML never carries the overlay,
  // while a FIRST-TIME visitor's first client render computed `true` and did -
  // a hydration mismatch that only someone arriving without a record could hit,
  // which is why it could not matter before v0.14 opened the front door.
  //
  // `renderToStaticMarkup` is the instrument because it runs the render phase
  // and never runs effects, which is exactly what "the first render" means here.
  // jsdom hands it a real `window` and a readable (empty) localStorage, so this
  // assertion is strictly HARDER than production: the overlay must be absent
  // even when the answer IS readable during the render pass. A `typeof window`
  // guard in the JSX therefore cannot satisfy it - only moving the read out of
  // the initializer can.
  it("keeps the onboarding overlay out of the first render pass, so it matches the prerender", () => {
    window.localStorage.clear();

    const markup = renderToStaticMarkup(<Home />);

    // Blindness control: an empty or thrown-away render would satisfy the
    // absence assertion below for entirely the wrong reason.
    expect(markup).toContain("Today-first coaching");
    expect(markup).not.toContain("onboarding-container");
  });

  it("opens onboarding for a first-time visitor once the client settles", async () => {
    window.localStorage.clear();

    render(<Home />);

    expect(await screen.findByTestId("onboarding-container")).toBeTruthy();
  });

  it("records a complete preference record when onboarding is skipped", async () => {
    window.localStorage.setItem("calm-daily-coach:onboarding", "not json at all");

    render(<Home />);

    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-container")).toBeNull();
    });
    expect(JSON.parse(window.localStorage.getItem("calm-daily-coach:onboarding") ?? "null")).toEqual({
      defaultFocus: "Deep Work",
      defaultDose: "light",
      defaultTheme: "dark",
    });
  });

  // Onboarding has no trigger element to restore focus to (unlike
  // KeyboardHelp's "?" button): it is raised by a deferred effect on a first
  // visit, so without an explicit target the browser drops focus back to
  // `document.body` when the dialog unmounts, silently costing a keyboard or
  // screen-reader visitor their place. Both close paths (Skip and complete)
  // must hand focus somewhere deliberate instead.
  it("moves focus to the dashboard heading when onboarding is skipped, instead of dropping it on the body", async () => {
    window.localStorage.clear();

    render(<Home />);

    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-container")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    });
  });

  it("moves focus to the dashboard heading when onboarding completes, instead of dropping it on the body", async () => {
    window.localStorage.clear();

    render(<Home />);

    fireEvent.click(await screen.findByRole("button", { name: "Quick start now" }));

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-container")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    });
  });

  // The two tests above say WHERE focus lands. This one says WHEN, and that is
  // the half that was wrong: restoring focus from inside the close handler put
  // the move BEFORE the overlay's unmount, so anything the overlay still had
  // pending could take it straight back. Onboarding does have something
  // pending - a mount effect that focuses its own panel - and React only
  // guarantees that effect has flushed before the NEXT render. A close landing
  // in that one-macrotask window ran `focus(heading)` -> `focus(overlay)` ->
  // overlay unmounts -> `document.body`, permanently, and that is what reded
  // the post-merge Quality Gate on `e11271d` (a docs-only commit) plus three
  // earlier PR/local runs, always on the assertion above and never
  // reproducibly.
  //
  // So assert the ordering invariant that makes the window unreachable: by the
  // time the heading is focused, the overlay is already out of the document.
  // A restore that runs inline in the handler cannot satisfy this, whatever
  // the machine's timing does.
  it("restores focus only after the onboarding overlay has left the DOM, so the overlay cannot take it back", async () => {
    window.localStorage.clear();

    const focusCalls: { tag: string; overlayStillInDocument: boolean }[] = [];
    const realFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function recordFocus(this: HTMLElement, ...args: unknown[]) {
      focusCalls.push({
        tag: this.tagName,
        overlayStillInDocument: document.querySelector('[data-testid="onboarding-container"]') !== null,
      });
      return (realFocus as (...rest: unknown[]) => void).apply(this, args);
    } as typeof HTMLElement.prototype.focus;

    try {
      render(<Home />);

      fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

      await waitFor(() => {
        expect(screen.queryByTestId("onboarding-container")).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      });

      const headingFocus = focusCalls.filter((call) => call.tag === "H1");
      expect(headingFocus).toHaveLength(1);
      expect(headingFocus[0].overlayStillInDocument).toBe(false);
    } finally {
      HTMLElement.prototype.focus = realFocus;
    }
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
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);

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

  it("announces a sign-in failure in an assertive live region", async () => {
    // Moved here from `subscription-guard.test.tsx` by v0.14 PR2. The gate used
    // to render its own "Continue with Google" button, and its wall was the only
    // place `authMessage` appeared; with the wall gone (decision D1), the
    // dashboard's account block is where a signed-out person actually signs in,
    // so this is where the announcement has to hold. Stronger than the version
    // it replaces: the message is produced by the REAL `useCoachAuth` hook
    // failing for a real reason (no Firebase config) rather than handed in by a
    // mock, so a hook that stopped reporting failures would fail this test too.
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Google login is not configured yet.");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
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
