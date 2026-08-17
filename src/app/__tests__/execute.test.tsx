import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExecutePage from "@/app/execute/page";
import {
  BROKEN_FORM,
  renderedClassNames,
  WORKING_FORM,
} from "@/__tests__/helpers/rendered-theme";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { useCoachPlanner } from "@/app/hooks/use-coach-planner";

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

const authMock = {
  authUser: null,
  authMessage: "",
  authConfigured: false,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

const activePlan = {
  date: "2026-06-27",
  focus: "Deep Work",
  dose: "medium",
  minutes: 15,
  action: "Run one 15-minute focus block with zero context switching.",
  reflection: "What interrupted your focus, and how will you prevent it tomorrow?",
  optionalResource: "Optional: Use a single-task timer for your next block.",
  capMessage: "You reached today's plan. See you tomorrow.",
};

describe("Execute Page plan adjustments", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a calm empty state with a Focus link when no plan exists", () => {
    vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
    vi.mocked(useCoachPlanner).mockReturnValue({
      plan: null,
      checkinStatus: { type: "idle" },
      submitCheckin: vi.fn(),
      skipReason: "",
      setSkipReason: vi.fn(),
      startNextDay: vi.fn(),
      updatePlan: vi.fn(),
    } as never);

    render(<ExecutePage />);

    expect(screen.getByTestId("empty-state-plan")).toBeTruthy();
    expect(screen.getByText("No plan yet, and that is okay")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start in Focus" }).getAttribute("href")).toBe(
      "/focus",
    );
    // The plan surface itself stays hidden until a plan exists.
    expect(screen.queryByText("Today's deliberate dose")).toBeNull();
  });

  it("allows starting plan adjustments and saving them", () => {
    vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
    
    const updatePlan = vi.fn();
    vi.mocked(useCoachPlanner).mockReturnValue({
      plan: activePlan,
      checkinStatus: { type: "idle" },
      submitCheckin: vi.fn(),
      skipReason: "",
      setSkipReason: vi.fn(),
      startNextDay: vi.fn(),
      updatePlan,
    } as never);

    render(<ExecutePage />);

    // With an active plan the empty state disappears.
    expect(screen.queryByTestId("empty-state-plan")).toBeNull();
    expect(screen.getByText("Adjust plan targets")).toBeTruthy();
    
    // Toggle edit targets form
    fireEvent.click(screen.getByText("Adjust plan targets"));

    expect(screen.getByText("Customize plan targets (constrained edits)")).toBeTruthy();
    
    // Mock changing of description inputs
    const actionInput = screen.getByLabelText("Action sprint description") as HTMLTextAreaElement;
    fireEvent.change(actionInput, { target: { value: "Run 15 mins focus" } });

    // Click save adjustments button
    fireEvent.click(screen.getByText("Save adjustments"));

    expect(updatePlan).toHaveBeenCalledWith({
      action: "Run 15 mins focus",
      reflection: activePlan.reflection,
    });
  });

  // The rendered-DOM half of the theme guard (see ambient-page.test.tsx and
  // css-var-syntax-guard.test.ts): the constrained-edits form only exists in
  // the DOM after "Adjust plan targets" is toggled, so a source scan cannot
  // see what that branch paints.
  it("emits only paintable theme tokens, collapsed and with the edit form open", () => {
    vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
    vi.mocked(useCoachPlanner).mockReturnValue({
      plan: activePlan,
      checkinStatus: { type: "idle" },
      submitCheckin: vi.fn(),
      skipReason: "",
      setSkipReason: vi.fn(),
      startNextDay: vi.fn(),
      updatePlan: vi.fn(),
    } as never);

    const { container } = render(<ExecutePage />);

    const collapsed = renderedClassNames(container);
    expect(collapsed.match(WORKING_FORM)?.length ?? 0).toBeGreaterThan(5);
    expect(
      collapsed.match(BROKEN_FORM) ?? [],
      "the plan surface renders Tailwind v3 CSS-variable utilities, which v4 " +
        "compiles to invalid declarations a browser drops",
    ).toEqual([]);

    fireEvent.click(screen.getByText("Adjust plan targets"));
    expect(screen.getByText("Customize plan targets (constrained edits)")).toBeTruthy();

    const expanded = renderedClassNames(container);
    expect(
      expanded.match(BROKEN_FORM) ?? [],
      "the edit-targets branch renders Tailwind v3 CSS-variable utilities; " +
        "this branch has no markup until the toggle is clicked",
    ).toEqual([]);
    // The branch actually rendered: the tree paints more than it did collapsed.
    expect(expanded).not.toBe(collapsed);
  });
});
