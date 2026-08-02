/**
 * First tests for `/focus`, the last of the thirteen routes without any.
 *
 * That is not a coincidence with the bug this file pins: `/focus` carried a
 * "Continue with Google" button that, when sign-in failed, rendered nothing
 * and announced nothing, because the page destructured `useCoachAuth` without
 * `authMessage`. The untested route was the one with the silent surface.
 *
 * `useCoachAuth` is deliberately left REAL here (only `@/lib/firebase` is
 * mocked, to the same "not configured" state a build without Firebase
 * variables really has), so the message under test is produced by the hook
 * failing for a real reason rather than handed in by a mock: a hook that
 * stopped reporting failures would fail these tests too. The planner hook IS
 * mocked, because this page's plan machinery is covered by
 * `use-coach-planner.test.ts` and is not what these assertions are about.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FocusPage from "@/app/focus/page";
import { useCoachPlanner } from "@/app/hooks/use-coach-planner";

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => null),
}));

vi.mock("@/app/hooks/use-coach-planner", () => ({
  useCoachPlanner: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const readyPlan = {
  date: "2026-06-27",
  focus: "Deep Work",
  dose: "medium",
  minutes: 15,
  action: "Run one 15-minute focus block with zero context switching.",
  reflection: "What interrupted your focus, and how will you prevent it tomorrow?",
  optionalResource: "Optional: Use a single-task timer for your next block.",
  capMessage: "You reached today's plan. See you tomorrow.",
};

function plannerState(overrides: Record<string, unknown> = {}) {
  return {
    focus: "Deep Work",
    setFocus: vi.fn(),
    dose: "medium",
    setDose: vi.fn(),
    notes: "",
    setNotes: vi.fn(),
    plan: null,
    loading: false,
    canGenerate: true,
    checkinStatus: { type: "idle" },
    generatePlan: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
    coachBrief: "",
    resetPlan: vi.fn(),
    ...overrides,
  } as never;
}

describe("Focus page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the first step of the loop and offers sign-in to a guest", () => {
    render(<FocusPage />);

    expect(screen.getByText("Set your focus")).toBeTruthy();
    expect(screen.getByText("Account Mode")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate plan" })).toBeTruthy();
    // Nothing has failed yet, so nothing is announced.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a sign-in failure in an assertive live region", async () => {
    render(<FocusPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Google login is not configured yet.");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  it("locks planning until today is closed, and offers the way out", () => {
    vi.mocked(useCoachPlanner).mockReturnValue(
      plannerState({ plan: readyPlan, checkinStatus: { type: "pending" } }),
    );

    render(<FocusPage />);

    expect(
      screen.getByText("Planning is locked until you close today. Complete or skip in Execute to unlock."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finish check-in to unlock" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Reset today's plan" })).toBeTruthy();
  });

  it("hands a finished plan on to Execute", () => {
    vi.mocked(useCoachPlanner).mockReturnValue(
      plannerState({ plan: readyPlan, checkinStatus: { type: "ok" }, coachBrief: "Keep it to one block." }),
    );

    render(<FocusPage />);

    expect(screen.getByRole("heading", { name: "Plan ready", level: 2 })).toBeTruthy();
    expect(screen.getByText("Keep it to one block.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue to Execute" }).getAttribute("href")).toBe(
      "/execute",
    );
  });
});
