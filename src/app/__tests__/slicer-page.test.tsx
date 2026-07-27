import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SlicerPage from "@/app/slicer/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { loadSlicedTasks, saveSlicedTasks, type SlicedTask } from "@/lib/slicer";

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
}));

const authMock = {
  authUser: null,
  authMessage: "",
  authConfigured: false,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

// Mock matchMedia or similar browser systems if needed
if (typeof window !== "undefined") {
  Object.defineProperty(window, "navigator", {
    value: { vibrate: vi.fn() },
    writable: true,
  });
}

beforeEach(() => {
  vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("ADHD Task Slicer Page", () => {
  it("renders the creation form, instructions and illustration wait mode initially", () => {
    render(<SlicerPage />);

    expect(screen.getByText("ADHD Task Slicer")).toBeTruthy();
    expect(screen.getByText("Slice a Task")).toBeTruthy();
    expect(screen.getByText("The Intimidating Task")).toBeTruthy();
    expect(screen.getByText("Primary Domain")).toBeTruthy();
    expect(screen.getByText("Waiting for an intimidating task")).toBeTruthy();

    // Before any slices exist, the history list shows a calm empty state.
    expect(screen.getByTestId("empty-state-slices")).toBeTruthy();
    expect(screen.getByText("No slices yet")).toBeTruthy();
  });

  it("procedurally generates step slices when submitting the form and shows the checklist", () => {
    render(<SlicerPage />);

    const input = screen.getByPlaceholderText("e.g., Clean off my chaotic desk");
    fireEvent.change(input, { target: { value: "Refactor my code modules" } });

    // Select Coding Domain
    const codingLabel = screen.getByText("Programming");
    fireEvent.click(codingLabel);

    // Submit form
    const submitBtn = screen.getByRole("button", { name: "🚀 Slice It!" });
    fireEvent.click(submitBtn);

    // Should render active focus step block
    expect(screen.getByText("Current Focus Task")).toBeTruthy();

    // The empty state clears as soon as a slice exists.
    expect(screen.queryByTestId("empty-state-slices")).toBeNull();

    // Total count of steps should show ("Micro-Step 1 of ...")
    expect(screen.queryByText(/micro-step 1 of/i)).toBeTruthy();

    // Verify checklist has steps structure (hides other steps in Focus Mode)
    expect(screen.getByText("Other Hidden Steps")).toBeTruthy();
  });

  it("advances step by step when marked complete and triggers success when done", () => {
    render(<SlicerPage />);

    const input = screen.getByPlaceholderText("e.g., Clean off my chaotic desk");
    fireEvent.change(input, { target: { value: "Short errand" } });

    // Submit General domain by default
    const submitBtn = screen.getByRole("button", { name: "🚀 Slice It!" });
    fireEvent.click(submitBtn);

    // Let's complete the steps by clicking the "Completed! Next Step" button until all steps are done.
    let nextBtn = screen.queryByRole("button", { name: "Completed! Next Step" });
    while (nextBtn) {
      fireEvent.click(nextBtn);
      nextBtn = screen.queryByRole("button", { name: "Completed! Next Step" });
    }

    // After completing all steps, we should see the finished state card (Task fully processed!)
    expect(screen.getByText("Task fully processed!")).toBeTruthy();
  });

  // v0.17 PR1 "Sign-in keeps your workspace": these are wiring proofs, not
  // restatements of slicer.test.ts's migration coverage. Firebase never
  // enters: the hook is mocked, both scopes live in real localStorage, and
  // the copy is observable end to end through the rendered page.
  describe("guest-to-account migration on sign-in (v0.17 PR1)", () => {
    function buildTask(id: string, title: string): SlicedTask {
      return {
        id,
        title,
        domain: "general",
        intimidation: "medium",
        steps: [
          { id: "step-1", text: "Set a micro countdown timer.", minutes: 1, completed: false },
        ],
        createdAt: "2026-07-01T12:00:00.000Z",
      };
    }

    function signIn(uid = "user-123") {
      vi.mocked(useCoachAuth).mockReturnValue({
        ...authMock,
        authUser: { uid },
      } as never);
    }

    it("brings tasks sliced signed out along, without deleting the guest copy", async () => {
      saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");
      signIn();

      render(<SlicerPage />);

      // The account scope starts empty, so the render-phase load shows
      // nothing; the migration effect must both copy AND re-read for the
      // task to appear in this same load (title renders in the active card
      // and the history list, hence findAll).
      const shown = await screen.findAllByText("Sort the garage paperwork");
      expect(shown.length).toBeGreaterThan(0);
      expect(loadSlicedTasks("user-123").map((t) => t.id)).toEqual(["task-guest-1"]);
      // D3: migration copies, it never moves.
      expect(loadSlicedTasks("guest").map((t) => t.id)).toEqual(["task-guest-1"]);
    });

    it("keeps the workspace when sign-in resolves on an already-open page", async () => {
      saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");

      const { rerender } = render(<SlicerPage />);

      // Mounted as a guest: the task is visible from the guest scope.
      const before = await screen.findAllByText("Sort the garage paperwork");
      expect(before.length).toBeGreaterThan(0);

      // Sign-in resolves underneath the open page. This is the exact seam
      // the milestone exists for: the next render re-keys storage to the
      // account scope (scope !== loadedScope), which without migration is
      // the moment a guest's entire list visibly vanishes.
      signIn();
      rerender(<SlicerPage />);

      const kept = await screen.findAllByText("Sort the garage paperwork");
      expect(kept.length).toBeGreaterThan(0);
      expect(loadSlicedTasks("user-123").map((t) => t.id)).toEqual(["task-guest-1"]);
      // D3: migration copies, it never moves.
      expect(loadSlicedTasks("guest").map((t) => t.id)).toEqual(["task-guest-1"]);
    });

    it("does not migrate anything for a signed-out visitor", async () => {
      saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");

      render(<SlicerPage />);

      const shown = await screen.findAllByText("Sort the garage paperwork");
      expect(shown.length).toBeGreaterThan(0);
      // Nothing was copied anywhere: the guest scope is the only one used.
      expect(loadSlicedTasks("user-123")).toHaveLength(0);
    });
  });
});
