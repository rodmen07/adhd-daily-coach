/**
 * First tests for `/focus`, the last of the thirteen routes without any.
 *
 * That is not a coincidence with the bug this file pins: `/focus` carried a
 * "Continue with Google" button that, when sign-in failed, rendered nothing
 * and announced nothing, because the page destructured `useCoachAuth` without
 * `authMessage`. The untested route was the one with the silent surface.
 *
 * `useCoachAuth` is deliberately left REAL here (only `@/lib/firebase` and the
 * `firebase/auth` SDK are mocked, to the same "not configured" state a build
 * without Firebase variables really has), so the message under test is produced
 * by the hook failing for a real reason rather than handed in by a mock: a hook
 * that stopped reporting failures would fail these tests too. The planner hook
 * IS mocked, because this page's plan machinery is covered by
 * `use-coach-planner.test.ts` and is not what these assertions are about.
 *
 * WHAT THE 2026-08-10 QA PASS ADDED, AND WHY
 * ------------------------------------------
 * Everything above this line rendered the route and asserted its FIRST PAINT.
 * That is the shape the backlog's open `% Funcs` finding is about: measured at
 * `a5a9601`, `focus/page.tsx` sat at 98.91% statements and **20% functions** -
 * the sharpest render-vs-exercise gap in the app - because every statement runs
 * during render while none of the handlers hanging off it were ever invoked.
 * Not one test clicked a category chip, picked a dose, typed a note, submitted
 * the form, reset the day, or signed out.
 *
 * Driving those handlers is what surfaced the defect the second half of this
 * file now pins: the improvement-category chips are the page's primary control,
 * and they told assistive technology neither what they were nor which one was
 * chosen. The container declared `role="list"` while every child was a
 * `<button>` - a list with no `listitem` in it, which ARIA presents as a list of
 * zero items - and the selected chip was marked only by the CSS class
 * `is-selected`, invisible to any non-visual reader. The repo's other chip
 * groups (`/now`'s durations, `/slicer`'s step toggles, the theme toggle) all
 * carry `aria-pressed`; this one and its sibling in `onboarding.tsx` did not.
 * `selection-state-guard.test.ts` now fails when a third one ships that way.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FocusPage from "@/app/focus/page";
import { useCoachPlanner } from "@/app/hooks/use-coach-planner";

const mockIsFirebaseConfigured = vi.fn();
const mockLoadFirebaseAuth = vi.fn();
const mockLoadFirebaseFirestore = vi.fn();

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: () => mockIsFirebaseConfigured(),
  loadFirebaseAuth: () => mockLoadFirebaseAuth(),
  loadFirebaseFirestore: () => mockLoadFirebaseFirestore(),
}));

const mockGetRedirectResult = vi.fn();
const mockOnAuthStateChanged = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSignInWithRedirect = vi.fn();
const mockSignOut = vi.fn();

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  getRedirectResult: (...args: unknown[]) => mockGetRedirectResult(...args),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signInWithRedirect: (...args: unknown[]) => mockSignInWithRedirect(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("@/app/hooks/use-coach-planner", () => ({
  useCoachPlanner: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

/** Stand-in for the Firebase `Auth` instance; the hook only ever passes it on. */
const AUTH = { name: "auth-instance" };

/** The observer the real hook registered, so a test can report a signed-in user. */
let authStateObserver: ((user: unknown) => void | Promise<void>) | null = null;

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

/**
 * The fifteen improvement categories, written out rather than imported from
 * `@/lib/plan`. Both this file and the page would read the same array, so an
 * imported expectation would agree with any reordering or renaming the page
 * made - including one that broke the chips.
 */
const FOCUS_AREA_LABELS = [
  "Career",
  "Communication",
  "Creativity",
  "Deep Work",
  "Finances",
  "Fitness",
  "Hobbies",
  "Home",
  "Learning",
  "Mindfulness",
  "Nutrition",
  "Organization",
  "Relationships",
  "Sleep",
  "Writing",
];

/** The chip group, by the accessible name a reader actually hears. */
function categoryGroup(): HTMLElement {
  return screen.getByRole("group", { name: "Improvement categories" });
}

describe("Focus page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState());

    // Default: the "not configured" build, which is what the original four
    // tests below were written against.
    mockIsFirebaseConfigured.mockReturnValue(false);
    mockLoadFirebaseAuth.mockResolvedValue(null);
    mockLoadFirebaseFirestore.mockResolvedValue(null);
    mockGetRedirectResult.mockResolvedValue(null);
    mockSignOut.mockResolvedValue(undefined);

    authStateObserver = null;
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, observer: (user: unknown) => void) => {
      authStateObserver = observer;
      return () => {};
    });
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

describe("Focus page controls actually drive the planner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState());
    mockIsFirebaseConfigured.mockReturnValue(false);
    mockLoadFirebaseAuth.mockResolvedValue(null);
    mockLoadFirebaseFirestore.mockResolvedValue(null);
    mockGetRedirectResult.mockResolvedValue(null);
    mockSignOut.mockResolvedValue(undefined);
    authStateObserver = null;
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, observer: (user: unknown) => void) => {
      authStateObserver = observer;
      return () => {};
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("hands each chip its OWN area, not just some area", () => {
    const setFocus = vi.fn();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ setFocus }));

    render(<FocusPage />);
    const group = categoryGroup();

    // Two different chips, checked one after the other: a single click would
    // pass even if every chip were wired to the same constant.
    fireEvent.click(within(group).getByRole("button", { name: "Fitness" }));
    expect(setFocus).toHaveBeenLastCalledWith("Fitness");

    fireEvent.click(within(group).getByRole("button", { name: "Writing" }));
    expect(setFocus).toHaveBeenLastCalledWith("Writing");

    expect(setFocus).toHaveBeenCalledTimes(2);
  });

  it("keeps the screen-reader select on the same setter as the chips", () => {
    const setFocus = vi.fn();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ setFocus }));

    render(<FocusPage />);

    fireEvent.change(screen.getByLabelText("Focus area"), { target: { value: "Sleep" } });

    expect(setFocus).toHaveBeenCalledWith("Sleep");
  });

  it("hands the chosen dose to the planner", () => {
    const setDose = vi.fn();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ setDose }));

    render(<FocusPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Deep (30 min)" }));
    expect(setDose).toHaveBeenLastCalledWith("deep");

    fireEvent.click(screen.getByRole("radio", { name: "Light (5 min)" }));
    expect(setDose).toHaveBeenLastCalledWith("light");
  });

  it("records typed context, and counts what the planner is holding", () => {
    const setNotes = vi.fn();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ setNotes }));

    render(<FocusPage />);

    fireEvent.change(screen.getByLabelText("Context for today (optional)"), {
      target: { value: "Two meetings" },
    });
    expect(setNotes).toHaveBeenCalledWith("Two meetings");

    cleanup();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ notes: "Two meetings" }));
    render(<FocusPage />);

    // "Two meetings" is twelve characters, counted out by hand rather than as
    // `notes.length`, which is the page's own expression for the same thing.
    expect(screen.getByText("12/280")).toBeTruthy();
  });

  it("asks the planner for a plan when the form is submitted", () => {
    const generatePlan = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ generatePlan }));

    render(<FocusPage />);

    fireEvent.click(screen.getByRole("button", { name: "Generate plan" }));

    expect(generatePlan).toHaveBeenCalledTimes(1);
  });

  it("resets the day through the lock note's own button", () => {
    const resetPlan = vi.fn();
    vi.mocked(useCoachPlanner).mockReturnValue(
      plannerState({ plan: readyPlan, checkinStatus: { type: "pending" }, resetPlan }),
    );

    render(<FocusPage />);

    fireEvent.click(screen.getByRole("button", { name: "Reset today's plan" }));

    expect(resetPlan).toHaveBeenCalledTimes(1);
  });

  it("disables every planning control while the day is locked, not just the submit", () => {
    vi.mocked(useCoachPlanner).mockReturnValue(
      plannerState({ plan: readyPlan, checkinStatus: { type: "pending" } }),
    );

    render(<FocusPage />);

    const chips = within(categoryGroup()).getAllByRole("button");
    expect(chips.every((chip) => chip.hasAttribute("disabled"))).toBe(true);
    expect((screen.getByLabelText("Focus area") as HTMLSelectElement).disabled).toBe(true);
    expect(
      screen.getAllByRole("radio").every((radio) => (radio as HTMLInputElement).disabled),
    ).toBe(true);
    expect(
      (screen.getByLabelText("Context for today (optional)") as HTMLTextAreaElement).disabled,
    ).toBe(true);
  });

  it("offers sign-out to a signed-in person, and really signs them out", async () => {
    mockIsFirebaseConfigured.mockReturnValue(true);
    mockLoadFirebaseAuth.mockResolvedValue(AUTH);

    render(<FocusPage />);

    // The SDK loads behind a dynamic import (v0.19 PR3), so the subscription is
    // registered a few microtasks after the first render.
    await act(async () => {});
    await waitFor(() => expect(authStateObserver).not.toBeNull());
    await act(async () => {
      await authStateObserver?.({ uid: "uid-1", email: "person@example.com", displayName: "A Person" });
    });

    expect(screen.getByText("Signed in as A Person")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith(AUTH));
  });
});

/**
 * The defect the pass above found. These assertions fail on the markup that
 * shipped up to `a5a9601`: `role="list"` on the container, and no
 * `aria-pressed` on any chip.
 */
describe("Focus page category chips expose themselves to assistive technology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ focus: "Fitness" }));
    mockIsFirebaseConfigured.mockReturnValue(false);
    mockLoadFirebaseAuth.mockResolvedValue(null);
    mockLoadFirebaseFirestore.mockResolvedValue(null);
    mockGetRedirectResult.mockResolvedValue(null);
    mockOnAuthStateChanged.mockImplementation(() => () => {});
  });

  afterEach(() => {
    cleanup();
  });

  it("groups the chips instead of declaring a list with nothing in it", () => {
    render(<FocusPage />);

    const group = categoryGroup();
    expect(group.getAttribute("role")).toBe("group");

    // The shipped markup was `role="list"` around fifteen `<button>` children.
    // ARIA's `list` requires owned `listitem` children, so what a reader was
    // handed was a named list of zero items.
    expect(screen.queryByRole("list", { name: "Improvement categories" })).toBeNull();
    expect(within(group).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(group).getAllByRole("button")).toHaveLength(FOCUS_AREA_LABELS.length);
  });

  it("marks the chosen category pressed, and every other chip not pressed", () => {
    render(<FocusPage />);

    const chips = within(categoryGroup()).getAllByRole("button");

    // Every chip states a selection state at all: a chip with the attribute
    // missing is the state this defect shipped in.
    expect(chips.filter((chip) => chip.hasAttribute("aria-pressed"))).toHaveLength(
      FOCUS_AREA_LABELS.length,
    );

    const pressed = chips.filter((chip) => chip.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toBe(within(categoryGroup()).getByRole("button", { name: "Fitness" }));
  });

  it("moves the pressed state when the planner reports a different area", () => {
    cleanup();
    vi.mocked(useCoachPlanner).mockReturnValue(plannerState({ focus: "Mindfulness" }));
    render(<FocusPage />);

    const group = categoryGroup();
    expect(within(group).getByRole("button", { name: "Mindfulness" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(group).getByRole("button", { name: "Fitness" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});
