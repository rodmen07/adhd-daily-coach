import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SlicerPage from "@/app/slicer/page";
import { BROKEN_FORM, renderedClassNames } from "@/__tests__/helpers/rendered-theme";
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

  // v0.30 (MIGRATION_VOICE.md D3/D4): the page SAYS what happened to a
  // person's tasks. This surface's silence was written by copying /journal's,
  // with a comment citing that silence as a convention - the exact spread-by-
  // imitation the migration-voice-guard now exists against. These are the
  // behaviour half that guard's call-site scan is paired with: they redden if
  // the page keeps the migrationNotice call and drops its return.
  describe("the migration speaks (v0.30)", () => {
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

    /**
     * Make ONE localStorage key unwritable, the way a full quota does - the
     * now-page suite's shape. `vi.restoreAllMocks` in the file-level afterEach
     * restores it.
     */
    function failWritesTo(key: string) {
      const real = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        writtenKey: string,
        value: string,
      ) {
        if (writtenKey === key) {
          throw new DOMException("exceeded the quota", "QuotaExceededError");
        }
        real.call(this, writtenKey, value);
      });
    }

    it("says the tasks are here after a copy that reached the account", async () => {
      saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");
      signIn();

      render(<SlicerPage />);

      const note = await screen.findByTestId("slicer-migration-note");
      // Composed from a literal, not from the copy module the page imports:
      // a shared constant on both sides would agree with itself (L-054).
      expect(note.textContent).toBe("Your earlier sliced tasks are here now.");
      expect(note.getAttribute("role")).toBeNull();
      expect(note.getAttribute("aria-live")).toBe("polite");
      expect(screen.queryByTestId("slicer-migration-error")).toBeNull();
      // TWO lines, not three: slicer.ts has no cloud twin, so no
      // "migrated-locally" sentence exists on this surface at all - the
      // omission is the decision (MIGRATION_VOICE.md D3).
      expect(screen.queryByTestId("slicer-migration-local")).toBeNull();
    });

    it("tells a signed-in person, assertively, when the copy could not be made", async () => {
      saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");
      signIn();
      failWritesTo("focus-adhd-coach:slicer:user-123");

      render(<SlicerPage />);

      const note = await screen.findByTestId("slicer-migration-error");
      expect(note.textContent).toBe("Could not bring your earlier sliced tasks across.");
      // A failed copy is the one outcome a person may need to act on.
      expect(note.getAttribute("role")).toBe("alert");
      expect(note.getAttribute("aria-live")).toBe("assertive");
      expect(screen.queryByTestId("slicer-migration-note")).toBeNull();
      // Nothing was lost: the guest copy is exactly where it was.
      expect(loadSlicedTasks("guest")).toHaveLength(1);
    });

    it("stays silent for a signed-in person with nothing to bring", async () => {
      // Account data only: the load has something to wait for, and the
      // migration has nothing to move - the zero-count direction of
      // GUEST_DATA_MIGRATION.md D5, asserted rather than assumed.
      saveSlicedTasks([buildTask("task-own-1", "Repot the kitchen herbs")], "user-123");
      signIn();

      render(<SlicerPage />);

      const shown = await screen.findAllByText("Repot the kitchen herbs");
      expect(shown.length).toBeGreaterThan(0);
      expect(screen.queryByTestId("slicer-migration-note")).toBeNull();
      expect(screen.queryByTestId("slicer-migration-local")).toBeNull();
      expect(screen.queryByTestId("slicer-migration-error")).toBeNull();
    });
  });

  // The rendered-DOM half of the theme guard (see ambient-page.test.tsx and
  // css-var-syntax-guard.test.ts): the selected-domain classes
  // (slicer/page.tsx ~line 381) exist in the DOM only on the chip currently
  // chosen, so driving the selection is the only way to reach that branch.
  // Unlike the other pages this one spells its tokens as `[var(--x)]`
  // arbitrary values (and carries known slate-literal debt, tracked in the
  // backlog), so there is no WORKING_FORM floor to assert here - the policy
  // this test pins is the ban on the bare broken spelling plus proof that the
  // driven branch actually rendered.
  it("emits no broken theme tokens as the domain selection is driven", () => {
    const { container } = render(<SlicerPage />);

    const idle = renderedClassNames(container);
    expect(
      idle.match(BROKEN_FORM) ?? [],
      "the creation form renders Tailwind v3 CSS-variable utilities, which " +
        "v4 compiles to invalid declarations a browser drops",
    ).toEqual([]);

    // "general" is the default, so the Programming chip starts unselected.
    const domainChip = () => {
      const button = screen.getByText("Programming").closest("button");
      if (!button) throw new Error("no domain chip button found around Programming");
      return button;
    };
    const unselected = domainChip().getAttribute("class") ?? "";
    fireEvent.click(domainChip());

    const selected = renderedClassNames(container);
    expect(
      selected.match(BROKEN_FORM) ?? [],
      "the selected-domain branch renders Tailwind v3 CSS-variable " +
        "utilities; this branch paints on a chip only once it is chosen",
    ).toEqual([]);
    // The branch actually rendered: the chosen chip paints differently now.
    expect(domainChip().getAttribute("class")).not.toBe(unselected);
  });
});
