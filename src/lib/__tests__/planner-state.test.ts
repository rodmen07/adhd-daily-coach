import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInitialPlannerState,
  migrateGuestPlannerState,
  persistPlannerState,
  scopedPlannerStorageKey,
  type SavedPlannerState,
} from "@/lib/planner-state";

describe("planner state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("builds scoped storage key", () => {
    expect(scopedPlannerStorageKey("guest")).toBe("calm-daily-coach:guest");
  });

  it("uses onboarding defaults when no saved scope state exists", () => {
    window.localStorage.setItem(
      "calm-daily-coach:onboarding",
      JSON.stringify({ defaultFocus: "Fitness", defaultDose: "medium" }),
    );

    const initial = getInitialPlannerState("guest");
    expect(initial.focus).toBe("Fitness");
    expect(initial.dose).toBe("medium");
  });

  it("persists and restores planner state with current-day plan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T10:00:00.000Z"));

    persistPlannerState("guest", {
      focus: "Learning",
      dose: "deep",
      notes: "chapter 2",
      email: "dev@example.com",
      plan: {
        date: "2026-07-03",
        focus: "Learning",
        dose: "deep",
        minutes: 30,
        action: "Study",
        reflection: "Recall",
        optionalResource: null,
        capMessage: "Done",
      },
      checkedIn: { date: "2026-07-03", status: "done" },
    });

    const restored = getInitialPlannerState("guest");
    expect(restored.focus).toBe("Learning");
    expect(restored.dose).toBe("deep");
    expect(restored.plan?.date).toBe("2026-07-03");
    expect(restored.checkedIn).toEqual({ date: "2026-07-03", status: "done" });

    vi.useRealTimers();
  });

  it("drops stale plans from previous day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T10:00:00.000Z"));

    window.localStorage.setItem(
      scopedPlannerStorageKey("guest"),
      JSON.stringify({
        focus: "Deep Work",
        dose: "light",
        notes: "",
        email: "",
        plan: {
          date: "2026-07-02",
          focus: "Deep Work",
          dose: "light",
          minutes: 5,
          action: "A",
          reflection: "B",
          optionalResource: null,
          capMessage: "C",
        },
        checkedIn: { date: "2026-07-02", status: "done" },
      }),
    );

    const restored = getInitialPlannerState("guest");
    expect(restored.plan).toBeNull();
    expect(restored.checkedIn).toBeNull();

    vi.useRealTimers();
  });

  // v0.17 PR2: live same-day guest planner state crosses sign-in so the
  // dashboard ring does not reset at the moment of conversion.
  describe("migrateGuestPlannerState", () => {
    const TODAY = "2026-07-03";
    const YESTERDAY = "2026-07-02";

    function dayState(date: string, overrides: Partial<SavedPlannerState> = {}): SavedPlannerState {
      return {
        focus: "Learning",
        dose: "deep",
        notes: "guest notes",
        email: "",
        plan: {
          date,
          focus: "Learning",
          dose: "deep",
          minutes: 30,
          action: "Study",
          reflection: "Recall",
          optionalResource: null,
          capMessage: "Done",
        },
        checkedIn: { date, status: "done" },
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`${TODAY}T10:00:00.000Z`));
    });

    it("writes its marker with these exact bytes", async () => {
      // The PR #113 precedent: the marker shape is load-bearing state on real
      // devices, so its bytes are pinned literally rather than via the same
      // helper that produced them.
      persistPlannerState("guest", dayState(TODAY));

      await migrateGuestPlannerState("user-123");

      expect(
        window.localStorage.getItem(
          "calm-daily-coach-migrated-guest:user-123:local:planner",
        ),
      ).toBe("1");
    });

    it("copies live same-day guest state into an account scope that has none", async () => {
      persistPlannerState("guest", dayState(TODAY));

      const result = await migrateGuestPlannerState("user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 1 });
      const account = getInitialPlannerState("user-123");
      expect(account.checkedIn).toEqual({ date: TODAY, status: "done" });
      expect(account.plan?.date).toBe(TODAY);
      expect(account.notes).toBe("guest notes");
      // The guest copy is never deleted (D4).
      expect(getInitialPlannerState("guest").checkedIn).toEqual({
        date: TODAY,
        status: "done",
      });
    });

    it("never overwrites a live account blob (D3, account wins)", async () => {
      persistPlannerState("guest", dayState(TODAY));
      persistPlannerState(
        "user-123",
        dayState(TODAY, { notes: "the account's own notes", checkedIn: null }),
      );
      const before = window.localStorage.getItem(scopedPlannerStorageKey("user-123"));

      const result = await migrateGuestPlannerState("user-123");

      // Complete-with-nothing-written, mirroring the list form's guard case.
      expect(result).toEqual({ status: "migrated", migratedCount: 0 });
      expect(window.localStorage.getItem(scopedPlannerStorageKey("user-123"))).toBe(before);
      expect(getInitialPlannerState("user-123").notes).toBe("the account's own notes");
    });

    it("treats a stale account blob as absent, matching the read-side staleness rule (D3)", async () => {
      persistPlannerState("guest", dayState(TODAY));
      persistPlannerState("user-123", dayState(YESTERDAY, { notes: "stale account day" }));

      const result = await migrateGuestPlannerState("user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 1 });
      const account = getInitialPlannerState("user-123");
      expect(account.checkedIn).toEqual({ date: TODAY, status: "done" });
      expect(account.notes).toBe("guest notes");
    });

    it("has nothing to copy from a guest blob whose day has passed", async () => {
      persistPlannerState("guest", dayState(YESTERDAY));

      const result = await migrateGuestPlannerState("user-123");

      expect(result).toEqual({ status: "skipped", migratedCount: 0 });
      expect(window.localStorage.getItem(scopedPlannerStorageKey("user-123"))).toBeNull();
      // Nothing live existed, so the marker still closes the question.
      expect(
        window.localStorage.getItem(
          "calm-daily-coach-migrated-guest:user-123:local:planner",
        ),
      ).toBe("1");
    });

    it("copies a checked-in day even when the plan itself was already cleared", async () => {
      // checkedIn is what the dashboard ring reads, so it alone is worth
      // carrying: this is the ring-reset seam in its purest form.
      persistPlannerState("guest", dayState(TODAY, { plan: null }));

      const result = await migrateGuestPlannerState("user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 1 });
      expect(getInitialPlannerState("user-123").checkedIn).toEqual({
        date: TODAY,
        status: "done",
      });
    });
  });
});
