import { createJournalStore } from "@/lib/journal-store";
import { guestMigrationMarker } from "@/lib/guest-migration";
import { listJournalEntries, saveJournalEntry, type JournalEntry } from "@/lib/journal";
import {
  addFirestoreJournalEntry,
  listFirestoreJournalEntries,
} from "@/lib/firestore-journal";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseFirestore: vi.fn(async () => null),
}));

/** One switch for both halves of the v0.19 PR3 surface: the sync config
 * probe the factory reads and the lazy client the adapter methods await. */
function mockFirebase(db: Firestore | null) {
  vi.mocked(isFirebaseConfigured).mockReturnValue(db !== null);
  vi.mocked(loadFirebaseFirestore).mockResolvedValue(db);
}

vi.mock("@/lib/journal", () => ({
  listJournalEntries: vi.fn(() => []),
  saveJournalEntry: vi.fn((dateKey: string, text: string) => ({
    date: dateKey,
    text: text.trim(),
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  })),
}));

vi.mock("@/lib/firestore-journal", () => ({
  addFirestoreJournalEntry: vi.fn((_db: unknown, dateKey: string, text: string) =>
    Promise.resolve({
      date: dateKey,
      text: text.trim(),
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    }),
  ),
  listFirestoreJournalEntries: vi.fn(() => Promise.resolve([])),
}));

// Mirrors src/lib/__tests__/checkin-store.test.ts's local/firestore/fallback/
// override coverage, adapted to the journal's read/write pair. The scenarios
// come straight from docs/design/JOURNAL_FIRESTORE_SYNC.md's done-when:
// unconfigured or signed-out stays local; configured and signed-in resolves
// firestore; a thrown Firestore error falls back to local; firestore mode is
// requested but Firestore itself is unavailable (misconfigured/offline, not
// a thrown error) falls back to local too; explicit local override always
// wins regardless of config.
describe("journal-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebase(null);
    window.localStorage.clear();
  });

  it("pure local: stays local when unconfigured or signed out", async () => {
    const store = createJournalStore(undefined, { signedIn: false });
    expect(store.backend).toBe("local");

    await store.saveJournalEntry("2026-07-20", "Grateful for warm coffee.", "guest");
    await store.listJournalEntries("guest");

    expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listJournalEntries)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFirestoreJournalEntry)).not.toHaveBeenCalled();
    expect(vi.mocked(listFirestoreJournalEntries)).not.toHaveBeenCalled();
  });

  it("pure firestore: resolves firestore when configured and signed in", async () => {
    mockFirebase({} as Firestore);
    const store = createJournalStore(undefined, { signedIn: true });
    expect(store.backend).toBe("firestore");

    await store.saveJournalEntry("2026-07-20", "Grateful for warm coffee.", "user-123");
    await store.listJournalEntries("user-123");

    expect(vi.mocked(addFirestoreJournalEntry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFirestoreJournalEntries)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveJournalEntry)).not.toHaveBeenCalled();
    expect(vi.mocked(listJournalEntries)).not.toHaveBeenCalled();
  });

  it("firestore-with-fallback-to-local: a thrown Firestore error falls back to local", async () => {
    mockFirebase({} as Firestore);
    vi.mocked(addFirestoreJournalEntry).mockRejectedValueOnce(new Error("permission-denied"));
    vi.mocked(listFirestoreJournalEntries).mockRejectedValueOnce(new Error("permission-denied"));
    vi.mocked(listJournalEntries).mockReturnValueOnce([
      {
        date: "2026-07-19",
        text: "Yesterday's local fallback entry.",
        createdAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
    ]);

    const store = createJournalStore(undefined, { signedIn: true });
    expect(store.backend).toBe("firestore");

    const saved = await store.saveJournalEntry("2026-07-20", "Grateful for warm coffee.", "user-123");
    const listed = await store.listJournalEntries("user-123");

    expect(vi.mocked(addFirestoreJournalEntry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFirestoreJournalEntries)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listJournalEntries)).toHaveBeenCalledTimes(1);
    // Call counts alone don't prove the caller actually gets usable data back
    // on the fallback path: assert the returned VALUES too.
    expect(saved).toEqual({
      date: "2026-07-20",
      text: "Grateful for warm coffee.",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(listed).toEqual([
      {
        date: "2026-07-19",
        text: "Yesterday's local fallback entry.",
        createdAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
    ]);
  });

  it("firestore-fallback: uses the local fallback adapter when firestore mode is requested but not configured", async () => {
    // Mirrors checkin-store.test.ts's "uses local fallback adapter when
    // firestore mode is requested but not configured" (isFirebaseConfigured
    // reports false here via the beforeEach default, i.e. misconfigured or
    // offline, not a thrown-error case like the test above).
    const store = createJournalStore("firestore");

    expect(store.backend).toBe("firestore-fallback");

    await store.saveJournalEntry("2026-07-20", "Grateful for warm coffee.", "guest");
    await store.listJournalEntries("guest");

    expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listJournalEntries)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFirestoreJournalEntry)).not.toHaveBeenCalled();
    expect(vi.mocked(listFirestoreJournalEntries)).not.toHaveBeenCalled();
  });

  it("explicit override: an explicit local setting always wins regardless of config", async () => {
    mockFirebase({} as Firestore);
    const store = createJournalStore("local", { signedIn: true });
    expect(store.backend).toBe("local");

    await store.saveJournalEntry("2026-07-20", "Grateful for warm coffee.", "user-123");

    expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFirestoreJournalEntry)).not.toHaveBeenCalled();
  });

  // v0.13 "Bring your data with you". The primitive itself is unit-tested in
  // guest-migration.test.ts; these cover the journal's own wiring of it
  // across all three backend branches, mirroring how the read/write pair is
  // covered above.
  describe("guest-to-account migration", () => {
    const guestEntries: JournalEntry[] = [
      {
        date: "2026-07-19",
        text: "Guest wrote this on the 19th.",
        createdAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
      {
        date: "2026-07-20",
        text: "Guest wrote this on the 20th.",
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ];

    function seedLocal(accountEntries: JournalEntry[] = []) {
      vi.mocked(listJournalEntries).mockImplementation((scopeKey = "guest") =>
        scopeKey === "guest" ? guestEntries : accountEntries,
      );
    }

    it("local: copies guest entries into the signed-in scope, once", async () => {
      seedLocal();
      const store = createJournalStore("local");

      const first = await store.migrateGuestJournalEntries("user-123");
      const second = await store.migrateGuestJournalEntries("user-123");

      expect(first).toEqual({ status: "migrated", migratedCount: 2 });
      expect(second).toEqual({ status: "already-migrated", migratedCount: 0 });
      expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledWith(
        "2026-07-19",
        "Guest wrote this on the 19th.",
        "user-123",
      );
    });

    it("local: account data wins, so a shared date is never overwritten", async () => {
      // saveJournalEntry upserts by date: without the conflict guard this
      // copy would destroy the account's own words for the 20th.
      seedLocal([
        {
          date: "2026-07-20",
          text: "The ACCOUNT wrote this on the 20th.",
          createdAt: "2026-07-20T09:00:00.000Z",
          updatedAt: "2026-07-20T09:00:00.000Z",
        },
      ]);
      const store = createJournalStore("local");

      const result = await store.migrateGuestJournalEntries("user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 1 });
      expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledWith(
        "2026-07-19",
        "Guest wrote this on the 19th.",
        "user-123",
      );
      expect(vi.mocked(saveJournalEntry)).not.toHaveBeenCalledWith(
        "2026-07-20",
        expect.anything(),
        expect.anything(),
      );
    });

    it("local: migrating the journal does not mark check-ins as migrated", async () => {
      seedLocal();
      const store = createJournalStore("local");

      await store.migrateGuestJournalEntries("user-123");

      expect(
        window.localStorage.getItem(guestMigrationMarker("user-123", "local", "journal")),
      ).toBe("1");
      // The v0.4 check-in marker (no collection segment) must be untouched.
      expect(
        window.localStorage.getItem(guestMigrationMarker("user-123", "local")),
      ).toBeNull();
    });

    it("firestore: reads the account and writes the copy through Firestore", async () => {
      mockFirebase({} as Firestore);
      vi.mocked(listJournalEntries).mockReturnValue(guestEntries);
      vi.mocked(listFirestoreJournalEntries).mockResolvedValue([]);

      const store = createJournalStore(undefined, { signedIn: true });
      expect(store.backend).toBe("firestore");

      const result = await store.migrateGuestJournalEntries("user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 2 });
      expect(vi.mocked(listFirestoreJournalEntries)).toHaveBeenCalledWith(
        expect.anything(),
        "user-123",
      );
      expect(vi.mocked(addFirestoreJournalEntry)).toHaveBeenCalledTimes(2);
      // The guest read is still local: a signed-out person has no cloud scope.
      expect(vi.mocked(listJournalEntries)).toHaveBeenCalledWith("guest");
      expect(vi.mocked(saveJournalEntry)).not.toHaveBeenCalled();
    });

    it("firestore: a thrown Firestore write retries the whole copy locally", async () => {
      mockFirebase({} as Firestore);
      vi.mocked(listFirestoreJournalEntries).mockResolvedValue([]);
      vi.mocked(addFirestoreJournalEntry).mockRejectedValueOnce(
        new Error("permission-denied"),
      );
      seedLocal();

      const store = createJournalStore(undefined, { signedIn: true });
      const result = await store.migrateGuestJournalEntries("user-123");

      // v0.28 clause 1 (MIGRATION_DESTINATION.md D2): the retry succeeded, but
      // in this browser. Reporting plain "migrated" here is what let the
      // surfaces claim the entries reached the account.
      expect(result).toEqual({ status: "migrated-locally", migratedCount: 2 });
      expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(2);
      // The failed firestore attempt left its own marker unset, so a later
      // online load can still sync; only the local marker is set here.
      expect(
        window.localStorage.getItem(
          guestMigrationMarker("user-123", "firestore", "journal"),
        ),
      ).toBeNull();
      expect(
        window.localStorage.getItem(guestMigrationMarker("user-123", "local", "journal")),
      ).toBe("1");
    });

    it("firestore-fallback: migrates locally when Firestore is unavailable", async () => {
      seedLocal();
      const store = createJournalStore("firestore");
      expect(store.backend).toBe("firestore-fallback");

      const result = await store.migrateGuestJournalEntries("user-123");

      // v0.28 D2: a firestore-RESOLVED adapter whose writes land in the
      // browser reports the destination, even though live this adapter cannot
      // carry a signed-in scope (auth needs the config the probe found
      // missing) - honesty in the type, exercised here.
      expect(result).toEqual({ status: "migrated-locally", migratedCount: 2 });
      expect(vi.mocked(saveJournalEntry)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(addFirestoreJournalEntry)).not.toHaveBeenCalled();
    });

    // v0.28 clause 2 (MIGRATION_DESTINATION.md D6): the future tense in the
    // D3 sentences - "will be copied to your account next time it can be
    // reached" - is a promise about the marker asymmetry above, so it is
    // pinned by a test rather than left as prose. The firestore marker is
    // still unwritten after the fallback, so the next load retries the cloud
    // copy and reports a real `migrated`.
    it("firestore: the next load after a local landing still reaches the account", async () => {
      mockFirebase({} as Firestore);
      vi.mocked(listFirestoreJournalEntries).mockResolvedValue([]);
      vi.mocked(addFirestoreJournalEntry).mockRejectedValueOnce(
        new Error("permission-denied"),
      );
      seedLocal();

      const store = createJournalStore(undefined, { signedIn: true });
      const first = await store.migrateGuestJournalEntries("user-123");
      expect(first.status).toBe("migrated-locally");

      // Second load, cloud write working this time.
      const second = await store.migrateGuestJournalEntries("user-123");

      expect(second).toEqual({ status: "migrated", migratedCount: 2 });
      expect(vi.mocked(addFirestoreJournalEntry)).toHaveBeenCalledTimes(3);
      for (const [, , , scopeKey] of vi.mocked(addFirestoreJournalEntry).mock.calls) {
        expect(scopeKey).toBe("user-123");
      }
      expect(
        window.localStorage.getItem(
          guestMigrationMarker("user-123", "firestore", "journal"),
        ),
      ).toBe("1");
    });

    it("stays a no-op for a signed-out visitor", async () => {
      seedLocal();
      const store = createJournalStore("local");

      const result = await store.migrateGuestJournalEntries("guest");

      expect(result).toEqual({ status: "skipped", migratedCount: 0 });
      expect(vi.mocked(saveJournalEntry)).not.toHaveBeenCalled();
    });
  });
});
