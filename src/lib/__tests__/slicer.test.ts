import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSlicedTasks,
  migrateGuestSlicedTasks,
  procedurallySliceTask,
  saveSlicedTasks,
  type SlicedTask,
} from "../slicer";

describe("ADHD Task Slicer Logics", () => {
  it("includes an initial grounding anchor step for high-intimidation settings", () => {
    const steps = procedurallySliceTask("Pay tax bill", "admin", "high");
    expect(steps.length).toBeGreaterThan(2);
    expect(steps[0].text).toContain("Touch your nose");
    expect(steps[0].minutes).toBe(1);
    expect(steps[0].alternativeText).toContain("Drink one sip of water");
  });

  it("includes an initial focusing anchor step for medium-intimidation settings", () => {
    const steps = procedurallySliceTask("Write essay outline", "writing", "medium");
    expect(steps.length).toBeGreaterThan(2);
    expect(steps[0].text).toContain("Close every unrelated browser tab");
    expect(steps[0].minutes).toBe(1);
  });

  it("yields domain and keyword-specific instructions for writing email tasks", () => {
    const steps = procedurallySliceTask("Write important email to advisor", "writing", "low");
    expect(steps.length).toBeGreaterThan(1);
    // Verified keyword-specific emails steps
    const hasEmailStep = steps.some((s) => s.text.includes("email draft") || s.text.includes("recipient"));
    expect(hasEmailStep).toBe(true);
  });

  it("yields coding domain specific steps", () => {
    const steps = procedurallySliceTask("Refactor focus tracker function", "coding", "low");
    expect(steps.length).toBeGreaterThan(1);
    const hasCodeStep = steps.some((s) => s.text.toLowerCase().includes("ide") || s.text.toLowerCase().includes("subtask") || s.text.toLowerCase().includes("code"));
    expect(hasCodeStep).toBe(true);
  });

  it("supports steps having alternative text for cognitive swaps", () => {
    const steps = procedurallySliceTask("Clean writing desk", "cleaning", "high");
    const deskSteps = steps.filter((s) => s.text.includes("cups") || s.text.includes("dishes") || s.text.includes("trash") || s.text.includes("nose"));
    expect(deskSteps.length).toBeGreaterThan(0);
    // Grounding or cleaning step should have alternative options
    const someWithAlt = steps.some((s) => s.alternativeText !== undefined);
    expect(someWithAlt).toBe(true);
  });
});

function buildTask(id: string, title: string, completedAt?: string): SlicedTask {
  return {
    id,
    title,
    domain: "general",
    intimidation: "medium",
    steps: [
      { id: "step-1", text: "Set a micro countdown timer.", minutes: 1, completed: false },
    ],
    createdAt: "2026-07-01T12:00:00.000Z",
    ...(completedAt ? { completedAt } : {}),
  };
}

describe("guest-to-account migration for sliced tasks (v0.17 PR1)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("pins the marker key's exact bytes, so a respelling cannot orphan migrated people", async () => {
    saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");

    await migrateGuestSlicedTasks("user-123");

    // The literal below is the second source (the first is what the runtime
    // actually wrote): if guestMigrationMarker or the collection segment is
    // ever respelled, this fails while everything else still "works",
    // which is exactly the drift it exists to catch (PR #113 precedent).
    expect(
      window.localStorage.getItem(
        "calm-daily-coach-migrated-guest:user-123:local:slicer",
      ),
    ).toBe("1");
  });

  it("copies guest tasks into the account scope without deleting the guest copy", async () => {
    saveSlicedTasks(
      [
        buildTask("task-guest-1", "Sort the garage paperwork"),
        buildTask("task-guest-2", "Reply to the dentist", "2026-07-02T09:00:00.000Z"),
      ],
      "guest",
    );

    const result = await migrateGuestSlicedTasks("user-123");

    expect(result).toEqual({ status: "migrated", migratedCount: 2 });
    expect(loadSlicedTasks("user-123").map((t) => t.id)).toEqual([
      "task-guest-1",
      "task-guest-2",
    ]);
    // D3: migration copies, it never moves.
    expect(loadSlicedTasks("guest").map((t) => t.id)).toEqual([
      "task-guest-1",
      "task-guest-2",
    ]);
  });

  it("skips a guest task whose id the account already holds, and appends the rest after the account's own", async () => {
    saveSlicedTasks([buildTask("task-shared", "The account version.")], "user-123");
    saveSlicedTasks(
      [
        buildTask("task-shared", "The guest version."),
        buildTask("task-guest-only", "Water the balcony plants"),
      ],
      "guest",
    );

    const result = await migrateGuestSlicedTasks("user-123");

    expect(result).toEqual({ status: "migrated", migratedCount: 1 });
    const accountTasks = loadSlicedTasks("user-123");
    expect(accountTasks.map((t) => t.id)).toEqual(["task-shared", "task-guest-only"]);
    // Account data wins: the shared id kept the account's record, untouched.
    expect(accountTasks[0]?.title).toBe("The account version.");
    expect(accountTasks.some((t) => t.title === "The guest version.")).toBe(false);
  });

  it("copies once: a second load sees already-migrated and duplicates nothing", async () => {
    saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");

    await migrateGuestSlicedTasks("user-123");
    const second = await migrateGuestSlicedTasks("user-123");

    expect(second).toEqual({ status: "already-migrated", migratedCount: 0 });
    expect(loadSlicedTasks("user-123")).toHaveLength(1);
  });

  it("reports error and leaves the marker unset when the account write throws, so the next load retries", async () => {
    saveSlicedTasks([buildTask("task-guest-1", "Sort the garage paperwork")], "guest");

    // The migration write is deliberately NOT routed through the swallowing
    // saveSlicedTasks: a quota throw must surface as `error` with the marker
    // unset, never as a "migrated" marker over a copy that never landed.
    const realSetItem = Storage.prototype.setItem;
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === "focus-adhd-coach:slicer:user-123") {
          throw new Error("QuotaExceededError (simulated)");
        }
        return realSetItem.call(this, key, value);
      });

    const failed = await migrateGuestSlicedTasks("user-123");

    expect(failed).toEqual({ status: "error", migratedCount: 0 });
    expect(
      window.localStorage.getItem(
        "calm-daily-coach-migrated-guest:user-123:local:slicer",
      ),
    ).toBeNull();

    setItemSpy.mockRestore();
    const retried = await migrateGuestSlicedTasks("user-123");

    expect(retried).toEqual({ status: "migrated", migratedCount: 1 });
    expect(loadSlicedTasks("user-123").map((t) => t.id)).toEqual(["task-guest-1"]);
  });
});
