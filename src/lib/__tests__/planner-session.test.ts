import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckinStoreAdapter } from "@/lib/checkin-store";
import { persistPlannerState, type SavedPlannerState } from "@/lib/planner-state";
import { hydratePlannerSession } from "@/lib/planner-session";

function baseState(): SavedPlannerState {
  return {
    focus: "Deep Work",
    dose: "light",
    notes: "",
    email: "",
    plan: null,
    checkedIn: null,
  };
}

function makeStore() {
  const weeklySummary = {
    windowStart: "2026-06-27",
    windowEnd: "2026-07-03",
    total: 1,
    done: 1,
    skipped: 0,
    completionRate: 1,
    byFocus: {
      Career: { done: 0, skipped: 0 },
      Communication: { done: 0, skipped: 0 },
      Creativity: { done: 0, skipped: 0 },
      "Deep Work": { done: 1, skipped: 0 },
      Finances: { done: 0, skipped: 0 },
      Fitness: { done: 0, skipped: 0 },
      Hobbies: { done: 0, skipped: 0 },
      Home: { done: 0, skipped: 0 },
      Learning: { done: 0, skipped: 0 },
      Mindfulness: { done: 0, skipped: 0 },
      Nutrition: { done: 0, skipped: 0 },
      Organization: { done: 0, skipped: 0 },
      Relationships: { done: 0, skipped: 0 },
      Sleep: { done: 0, skipped: 0 },
      Writing: { done: 0, skipped: 0 },
    },
  };

  const store: Pick<CheckinStoreAdapter, "migrateGuestCheckins" | "getWeeklySummary"> = {
    migrateGuestCheckins: vi.fn(async () => ({ status: "skipped" as const, migratedCount: 0 })),
    getWeeklySummary: vi.fn(async () => weeklySummary),
  };

  return { store, weeklySummary };
}

describe("hydratePlannerSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates guest scope without migration and preserves summary", async () => {
    const { store, weeklySummary } = makeStore();

    const result = await hydratePlannerSession({
      initialState: baseState(),
      authEmail: "user@example.com",
      storageScope: "guest",
      checkinStore: store,
    });

    expect(result.nextState.email).toBe("user@example.com");
    expect(result.migrationStatus.type).toBe("idle");
    expect(result.weeklySummary).toEqual(weeklySummary);
    expect(store.migrateGuestCheckins).not.toHaveBeenCalled();
  });

  it("returns migration success status for signed-in scope", async () => {
    const { store } = makeStore();
    vi.mocked(store.migrateGuestCheckins).mockResolvedValueOnce({
      status: "migrated",
      migratedCount: 2,
    });

    const result = await hydratePlannerSession({
      initialState: baseState(),
      authEmail: null,
      storageScope: "uid-123",
      checkinStore: store,
    });

    expect(result.migrationStatus.type).toBe("ok");
    if (result.migrationStatus.type === "ok") {
      expect(result.migrationStatus.message).toContain("Migrated 2 guest check-ins");
    }
  });

  // v0.28 (docs/design/MIGRATION_DESTINATION.md D3/D4): the same completed
  // copy, landed in this browser. `/` used to render "Migrated 2 guest
  // check-ins to your account." for this result, because the store returned
  // plain `migrated`; the account claim was the defect.
  it("returns a notice, not a success, when the copy landed in this browser", async () => {
    const { store } = makeStore();
    vi.mocked(store.migrateGuestCheckins).mockResolvedValueOnce({
      status: "migrated-locally",
      migratedCount: 2,
    });

    const result = await hydratePlannerSession({
      initialState: baseState(),
      authEmail: null,
      storageScope: "uid-123",
      checkinStore: store,
    });

    // Composed from a literal rather than from planner-session's own string,
    // which would agree with itself however it changed (L-054).
    expect(result.migrationStatus).toEqual({
      type: "notice",
      message:
        "Your earlier check-ins are safe in this browser. They will be copied to your account next time it can be reached.",
    });
  });

  it("keeps the account claim off every fallback outcome", async () => {
    // The contract clause, stated as a property rather than as one example:
    // no `migrated-locally` result may produce a sentence claiming the
    // records reached the account.
    for (const migratedCount of [1, 2, 9]) {
      const { store } = makeStore();
      vi.mocked(store.migrateGuestCheckins).mockResolvedValueOnce({
        status: "migrated-locally",
        migratedCount,
      });

      const result = await hydratePlannerSession({
        initialState: baseState(),
        authEmail: null,
        storageScope: "uid-123",
        checkinStore: store,
      });

      expect(result.migrationStatus.type).toBe("notice");
      if (result.migrationStatus.type !== "idle") {
        expect(result.migrationStatus.message).not.toMatch(/to your account\./);
        expect(result.migrationStatus.message).toContain("safe in this browser");
      }
    }
  });

  it("returns migration error status and null summary on summary failure", async () => {
    const { store } = makeStore();
    vi.mocked(store.migrateGuestCheckins).mockResolvedValueOnce({
      status: "error",
      migratedCount: 1,
    });
    vi.mocked(store.getWeeklySummary).mockRejectedValueOnce(new Error("summary failed"));

    const result = await hydratePlannerSession({
      initialState: {
        ...baseState(),
        email: "persisted@example.com",
      },
      authEmail: "auth@example.com",
      storageScope: "uid-123",
      checkinStore: store,
    });

    expect(result.nextState.email).toBe("persisted@example.com");
    expect(result.migrationStatus.type).toBe("error");
    expect(result.weeklySummary).toBeNull();
  });

  // v0.17 PR2: the planner blob crosses sign-in inside this hydrate, before
  // the returned state reaches the dashboard ring. These run the REAL
  // migration against jsdom localStorage; only the check-in store is faked.
  describe("guest planner state at sign-in", () => {
    function seedGuestDay(): { today: string } {
      const today = "2026-07-03";
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`${today}T10:00:00.000Z`));
      persistPlannerState("guest", {
        focus: "Learning",
        dose: "deep",
        notes: "guest notes",
        email: "",
        plan: {
          date: today,
          focus: "Learning",
          dose: "deep",
          minutes: 30,
          action: "Study",
          reflection: "Recall",
          optionalResource: null,
          capMessage: "Done",
        },
        checkedIn: { date: today, status: "done" },
      });
      return { today };
    }

    it("hands the ring the guest's completed day in the same hydrate", async () => {
      const { today } = seedGuestDay();
      const { store } = makeStore();

      const result = await hydratePlannerSession({
        initialState: baseState(),
        authEmail: null,
        storageScope: "uid-123",
        checkinStore: store,
      });

      // initialState was read before the copy landed; the migrated day must
      // still be in nextState, because this is the state the ring renders.
      expect(result.nextState.checkedIn).toEqual({ date: today, status: "done" });
      expect(result.nextState.plan?.date).toBe(today);
      expect(result.migrationStatus).toEqual({
        type: "ok",
        message: "Brought today's plan along to your account.",
      });
    });

    it("keeps the check-in migration's own message when both migrations moved data", async () => {
      seedGuestDay();
      const { store } = makeStore();
      vi.mocked(store.migrateGuestCheckins).mockResolvedValueOnce({
        status: "migrated",
        migratedCount: 2,
      });

      const result = await hydratePlannerSession({
        initialState: baseState(),
        authEmail: null,
        storageScope: "uid-123",
        checkinStore: store,
      });

      // One calm line, not a stack: the check-in message stands, and the
      // migrated planner state is still what the ring receives.
      expect(result.migrationStatus.type).toBe("ok");
      if (result.migrationStatus.type === "ok") {
        expect(result.migrationStatus.message).toContain("Migrated 2 guest check-ins");
      }
      expect(result.nextState.checkedIn).not.toBeNull();
    });

    // v0.28, and the reason this milestone ships ONE new sentence on `/`
    // rather than the two MIGRATION_DESTINATION.md D3 listed. The planner's
    // own copy is local by construction - `migrateGuestPlannerState` pins the
    // marker to the `local` backend (planner-state.ts:180) and no
    // `firestore-*` module mentions the planner at all - so it can never
    // produce `migrated-locally`, and D2 excludes the plain local backend on
    // purpose. This test pins the OTHER half of that reasoning: even when
    // both migrations move data, the planner's account sentence is
    // unreachable behind the check-in notice, so a planner-specific line
    // would have nowhere to render. The roadmap's clause 3 records the
    // scope reduction.
    it("keeps the local-landing notice rather than the planner's account sentence", async () => {
      seedGuestDay();
      const { store } = makeStore();
      vi.mocked(store.migrateGuestCheckins).mockResolvedValueOnce({
        status: "migrated-locally",
        migratedCount: 2,
      });

      const result = await hydratePlannerSession({
        initialState: baseState(),
        authEmail: null,
        storageScope: "uid-123",
        checkinStore: store,
      });

      expect(result.migrationStatus.type).toBe("notice");
      if (result.migrationStatus.type !== "idle") {
        expect(result.migrationStatus.message).toBe(
          "Your earlier check-ins are safe in this browser. They will be copied to your account next time it can be reached.",
        );
      }
      // The planner state still crossed, which is what the ring renders.
      expect(result.nextState.checkedIn).not.toBeNull();
    });

    it("never runs the planner migration for a guest hydrate", async () => {
      seedGuestDay();
      const { store } = makeStore();

      await hydratePlannerSession({
        initialState: baseState(),
        authEmail: null,
        storageScope: "guest",
        checkinStore: store,
      });

      expect(
        window.localStorage.getItem(
          "calm-daily-coach-migrated-guest:guest:local:planner",
        ),
      ).toBeNull();
    });
  });
});
