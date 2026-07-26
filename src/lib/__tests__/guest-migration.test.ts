import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUEST_SCOPE_KEY,
  guestMigrationMarker,
  migrateGuestRecords,
  type GuestMigrationPlan,
} from "@/lib/guest-migration";

type Note = { date: string; text: string };

const GUEST_NOTES: Note[] = [
  { date: "2026-07-19", text: "Guest wrote this on the 19th." },
  { date: "2026-07-20", text: "Guest wrote this on the 20th." },
];

const MARKER = guestMigrationMarker("user-123", "local", "notes");

function buildPlan(overrides: Partial<GuestMigrationPlan<Note>> = {}) {
  const written: Note[] = [];
  const plan: GuestMigrationPlan<Note> = {
    markerKey: MARKER,
    listGuestRecords: vi.fn(() => GUEST_NOTES),
    write: vi.fn(async (note: Note) => {
      written.push(note);
    }),
    ...overrides,
  };

  return { plan, written };
}

describe("guest-migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe("marker keys (D2)", () => {
    it("keeps the collection-less key byte-identical to the v0.4 check-in key", () => {
      // Check-ins have written this exact string since v0.4. Appending a
      // ":checkins" segment for symmetry would make every already-migrated
      // person look un-migrated and re-run their copy, so the shape is
      // pinned here rather than left to a future tidy-up.
      expect(guestMigrationMarker("user-123", "local")).toBe(
        "calm-daily-coach-migrated-guest:user-123:local",
      );
    });

    it("gives each collection its own key, per scope and per backend", () => {
      const keys = new Set([
        guestMigrationMarker("user-123", "local"),
        guestMigrationMarker("user-123", "local", "journal"),
        guestMigrationMarker("user-123", "local", "focusSessions"),
        guestMigrationMarker("user-123", "firestore", "journal"),
        guestMigrationMarker("user-999", "local", "journal"),
      ]);

      expect(keys.size).toBe(5);
    });
  });

  describe("guards", () => {
    it("skips the guest scope itself without reading or writing", async () => {
      const { plan } = buildPlan();

      const result = await migrateGuestRecords(plan, GUEST_SCOPE_KEY);

      expect(result).toEqual({ status: "skipped", migratedCount: 0 });
      expect(plan.listGuestRecords).not.toHaveBeenCalled();
      expect(plan.write).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(MARKER)).toBeNull();
    });

    it("skips an empty target scope", async () => {
      const { plan } = buildPlan();

      const result = await migrateGuestRecords(plan, "");

      expect(result).toEqual({ status: "skipped", migratedCount: 0 });
      expect(plan.write).not.toHaveBeenCalled();
    });

    it("marks an empty guest collection done so later loads do no work", async () => {
      const { plan } = buildPlan({ listGuestRecords: vi.fn(() => []) });

      const first = await migrateGuestRecords(plan, "user-123");
      const second = await migrateGuestRecords(plan, "user-123");

      expect(first).toEqual({ status: "skipped", migratedCount: 0 });
      expect(second).toEqual({ status: "already-migrated", migratedCount: 0 });
      expect(plan.write).not.toHaveBeenCalled();
    });
  });

  describe("copying", () => {
    it("copies every guest record into the account scope", async () => {
      const { plan, written } = buildPlan();

      const result = await migrateGuestRecords(plan, "user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 2 });
      expect(written).toEqual(GUEST_NOTES);
      expect(window.localStorage.getItem(MARKER)).toBe("1");
    });

    it("runs once: a second call writes nothing", async () => {
      const { plan } = buildPlan();

      const first = await migrateGuestRecords(plan, "user-123");
      const second = await migrateGuestRecords(plan, "user-123");

      expect(first.status).toBe("migrated");
      expect(second).toEqual({ status: "already-migrated", migratedCount: 0 });
      expect(plan.write).toHaveBeenCalledTimes(2);
    });

    it("never deletes the guest copy (D4)", async () => {
      const { plan } = buildPlan();

      await migrateGuestRecords(plan, "user-123");

      // The plan exposes no delete hook at all, so the strongest available
      // statement is that the source is still exactly what it was.
      expect(plan.listGuestRecords()).toEqual([
        { date: "2026-07-19", text: "Guest wrote this on the 19th." },
        { date: "2026-07-20", text: "Guest wrote this on the 20th." },
      ]);
    });
  });

  describe("conflict guard (D3, account data wins)", () => {
    it("skips a guest record whose identity key already exists on the account", async () => {
      const listAccountRecords = vi.fn(async () => [
        { date: "2026-07-20", text: "The ACCOUNT wrote this on the 20th." },
      ]);
      const { plan, written } = buildPlan({
        conflictGuard: { listAccountRecords, identityKey: (note) => note.date },
      });

      const result = await migrateGuestRecords(plan, "user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 1 });
      expect(written).toEqual([
        { date: "2026-07-19", text: "Guest wrote this on the 19th." },
      ]);
      // The account's own words are never handed to the writer.
      expect(written.some((note) => note.date === "2026-07-20")).toBe(false);
    });

    it("reads the account once, not once per record", async () => {
      const listAccountRecords = vi.fn(async () => []);
      const { plan } = buildPlan({
        conflictGuard: { listAccountRecords, identityKey: (note) => note.date },
      });

      await migrateGuestRecords(plan, "user-123");

      expect(listAccountRecords).toHaveBeenCalledTimes(1);
      expect(plan.write).toHaveBeenCalledTimes(2);
    });

    it("writes only the first of two guest records sharing an identity key", async () => {
      const { plan, written } = buildPlan({
        listGuestRecords: vi.fn(() => [
          { date: "2026-07-19", text: "First" },
          { date: "2026-07-19", text: "Second" },
        ]),
        conflictGuard: {
          listAccountRecords: async () => [],
          identityKey: (note) => note.date,
        },
      });

      const result = await migrateGuestRecords(plan, "user-123");

      expect(result.migratedCount).toBe(1);
      expect(written).toEqual([{ date: "2026-07-19", text: "First" }]);
    });

    it("an append-only plan (no guard) copies a record the account already has", async () => {
      // This is the check-in shape: several check-ins may legitimately share
      // a date, addCheckin mints a fresh id per write, and the marker alone
      // prevents duplication. Asserted here so removing checkin-store.ts's
      // deliberate absence of a guard is a visible decision, not a drift.
      const listAccountRecords = vi.fn(async () => GUEST_NOTES);
      const { plan, written } = buildPlan();

      const result = await migrateGuestRecords(plan, "user-123");

      expect(listAccountRecords).not.toHaveBeenCalled();
      expect(result.migratedCount).toBe(2);
      expect(written).toEqual(GUEST_NOTES);
    });
  });

  describe("failure", () => {
    it("reports error and leaves the marker unset so the next load retries", async () => {
      const { plan } = buildPlan({
        write: vi
          .fn<(record: Note) => Promise<void>>()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("offline")),
      });

      const result = await migrateGuestRecords(plan, "user-123");

      expect(result).toEqual({ status: "error", migratedCount: 1 });
      expect(window.localStorage.getItem(MARKER)).toBeNull();
    });

    it("reports error when the account read itself throws", async () => {
      const { plan } = buildPlan({
        conflictGuard: {
          listAccountRecords: async () => {
            throw new Error("permission-denied");
          },
          identityKey: (note) => note.date,
        },
      });

      const result = await migrateGuestRecords(plan, "user-123");

      expect(result).toEqual({ status: "error", migratedCount: 0 });
      expect(plan.write).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(MARKER)).toBeNull();
    });
  });

  it("one collection's migration never marks another as done", async () => {
    const { plan: notesPlan } = buildPlan();
    const { plan: otherPlan } = buildPlan({
      markerKey: guestMigrationMarker("user-123", "local", "other"),
    });

    await migrateGuestRecords(notesPlan, "user-123");
    const other = await migrateGuestRecords(otherPlan, "user-123");

    expect(other.status).toBe("migrated");
    expect(other.migratedCount).toBe(2);
  });
});
