import { createFocusSessionStore } from "@/lib/focus-session-store";
import { guestMigrationMarker } from "@/lib/guest-migration";
import { addFocusSession, listFocusSessions, putFocusSession } from "@/lib/focus-session";
import {
  addFirestoreFocusSession,
  listFirestoreFocusSessions,
  putFirestoreFocusSession,
} from "@/lib/firestore-focus-sessions";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";
import type { FocusSession } from "@/lib/focus-session";
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

function session(partial: Partial<FocusSession> = {}): FocusSession {
  return {
    id: partial.id ?? "session-1",
    task: partial.task ?? "Draft the intro paragraph",
    plannedMinutes: partial.plannedMinutes ?? 15,
    focusedSeconds: partial.focusedSeconds ?? 900,
    outcome: partial.outcome ?? "wrapped-up",
    date: partial.date ?? "2026-07-25",
    createdAt: partial.createdAt ?? "2026-07-25T00:00:00.000Z",
  };
}

vi.mock("@/lib/focus-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/focus-session")>();
  return {
    ...actual,
    listFocusSessions: vi.fn(() => []),
    putFocusSession: vi.fn((stored: unknown) => stored),
    addFocusSession: vi.fn(() => ({
      id: "local-session",
      task: "Draft the intro paragraph",
      plannedMinutes: 15,
      focusedSeconds: 900,
      outcome: "wrapped-up" as const,
      date: "2026-07-25",
      createdAt: "2026-07-25T00:00:00.000Z",
    })),
  };
});

vi.mock("@/lib/firestore-focus-sessions", () => ({
  addFirestoreFocusSession: vi.fn(() =>
    Promise.resolve({
      id: "firestore-session",
      task: "Draft the intro paragraph",
      plannedMinutes: 15,
      focusedSeconds: 900,
      outcome: "wrapped-up" as const,
      date: "2026-07-25",
      createdAt: "2026-07-25T00:00:00.000Z",
    }),
  ),
  listFirestoreFocusSessions: vi.fn(() => Promise.resolve([])),
  putFirestoreFocusSession: vi.fn((_db: unknown, stored: unknown) =>
    Promise.resolve(stored),
  ),
}));

// Mirrors src/lib/__tests__/journal-store.test.ts (v0.9), which itself mirrors
// checkin-store.test.ts, adapted to the focus session's read/write pair. The
// scenarios come straight from docs/design/FOCUS_IN_TRENDS.md section 5's
// done-when: unconfigured or signed-out stays local; configured and signed-in
// resolves firestore; a thrown Firestore error falls back to local (so a
// closed-out session is never lost); firestore mode requested but Firestore
// itself unavailable (misconfigured/offline, not a thrown error) falls back
// too; an explicit local override always wins regardless of config.
describe("focus-session-store", () => {
  const input = {
    task: "Draft the intro paragraph",
    plannedMinutes: 15,
    focusedSeconds: 900,
    outcome: "wrapped-up" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebase(null);
    window.localStorage.clear();
  });

  it("pure local: stays local when unconfigured or signed out", async () => {
    const store = createFocusSessionStore(undefined, { signedIn: false });
    expect(store.backend).toBe("local");

    await store.addFocusSession(input, "guest");
    await store.listFocusSessions("guest");

    expect(vi.mocked(addFocusSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFocusSessions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFirestoreFocusSession)).not.toHaveBeenCalled();
    expect(vi.mocked(listFirestoreFocusSessions)).not.toHaveBeenCalled();
  });

  it("pure firestore: resolves firestore when configured and signed in", async () => {
    mockFirebase({} as Firestore);
    const store = createFocusSessionStore(undefined, { signedIn: true });
    expect(store.backend).toBe("firestore");

    await store.addFocusSession(input, "user-123");
    await store.listFocusSessions("user-123");

    expect(vi.mocked(addFirestoreFocusSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFirestoreFocusSessions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFocusSession)).not.toHaveBeenCalled();
    expect(vi.mocked(listFocusSessions)).not.toHaveBeenCalled();
  });

  it("firestore-with-fallback-to-local: a thrown Firestore error falls back to local", async () => {
    mockFirebase({} as Firestore);
    vi.mocked(addFirestoreFocusSession).mockRejectedValueOnce(
      new Error("permission-denied"),
    );
    vi.mocked(listFirestoreFocusSessions).mockRejectedValueOnce(
      new Error("permission-denied"),
    );
    vi.mocked(listFocusSessions).mockReturnValueOnce([
      session({ id: "yesterday", date: "2026-07-24" }),
    ]);

    const store = createFocusSessionStore(undefined, { signedIn: true });
    expect(store.backend).toBe("firestore");

    const saved = await store.addFocusSession(input, "user-123");
    const listed = await store.listFocusSessions("user-123");

    expect(vi.mocked(addFirestoreFocusSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFirestoreFocusSessions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFocusSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFocusSessions)).toHaveBeenCalledTimes(1);
    // Call counts alone don't prove the caller gets usable data back on the
    // fallback path: assert the returned VALUES too (same reasoning as
    // journal-store.test.ts). A session that "saved" as undefined would be a
    // silently lost session, the one outcome this store exists to prevent.
    expect(saved.id).toBe("local-session");
    expect(listed).toEqual([session({ id: "yesterday", date: "2026-07-24" })]);
  });

  it("firestore-fallback: uses the local fallback adapter when firestore mode is requested but not configured", async () => {
    // isFirebaseConfigured reports false via the beforeEach default here, i.e.
    // misconfigured or offline, not a thrown-error case like the test above.
    const store = createFocusSessionStore("firestore");

    expect(store.backend).toBe("firestore-fallback");

    await store.addFocusSession(input, "guest");
    await store.listFocusSessions("guest");

    expect(vi.mocked(addFocusSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listFocusSessions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFirestoreFocusSession)).not.toHaveBeenCalled();
    expect(vi.mocked(listFirestoreFocusSessions)).not.toHaveBeenCalled();
  });

  it("explicit override: an explicit local setting always wins regardless of config", async () => {
    mockFirebase({} as Firestore);
    const store = createFocusSessionStore("local", { signedIn: true });
    expect(store.backend).toBe("local");

    await store.addFocusSession(input, "user-123");

    expect(vi.mocked(addFocusSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFirestoreFocusSession)).not.toHaveBeenCalled();
  });

  // v0.13 (docs/design/GUEST_DATA_MIGRATION.md section 3.2). Mirrors
  // journal-store.test.ts's migration block, minus the conflict-guard cases
  // this collection deliberately does not have and plus the two properties
  // that stand in for it: records are copied VERBATIM, and a re-copy is
  // idempotent because both writers key on the session's own id.
  describe("guest-to-account migration", () => {
    const guestSessions: FocusSession[] = [
      session({ id: "guest-1", task: "read one chapter", date: "2026-07-23" }),
      session({ id: "guest-2", task: "tidy the inbox", date: "2026-07-24" }),
    ];

    function seedGuest(sessions: FocusSession[] = guestSessions) {
      vi.mocked(listFocusSessions).mockImplementation((scopeKey = "guest") =>
        scopeKey === "guest" ? sessions : [],
      );
    }

    it("local: copies guest sessions into the signed-in scope, once", async () => {
      seedGuest();
      const store = createFocusSessionStore("local");

      const first = await store.migrateGuestFocusSessions("user-123");
      const second = await store.migrateGuestFocusSessions("user-123");

      expect(first).toEqual({ status: "migrated", migratedCount: 2 });
      expect(second).toEqual({ status: "already-migrated", migratedCount: 0 });
      expect(vi.mocked(putFocusSession)).toHaveBeenCalledTimes(2);
    });

    it("local: copies each session verbatim rather than restamping it", async () => {
      // The whole point of routing through putFocusSession: addFocusSession
      // would mint a new id and file the session under today, so a session
      // from last week would vanish from the week it happened in.
      seedGuest();
      const store = createFocusSessionStore("local");

      await store.migrateGuestFocusSessions("user-123");

      expect(vi.mocked(putFocusSession)).toHaveBeenCalledWith(
        guestSessions[0],
        "user-123",
      );
      expect(vi.mocked(putFocusSession)).toHaveBeenCalledWith(
        guestSessions[1],
        "user-123",
      );
      expect(vi.mocked(addFocusSession)).not.toHaveBeenCalled();
    });

    it("local: reads the guest scope but never writes to it", async () => {
      seedGuest();
      const store = createFocusSessionStore("local");

      await store.migrateGuestFocusSessions("user-123");

      expect(vi.mocked(listFocusSessions)).toHaveBeenCalledWith("guest");
      // D4, the half this layer can see: every write lands in the target
      // scope. Asserting `listFocusSessions("guest")` still returns the
      // records here would be circular, since the mock above is what returns
      // them - the real non-destruction proof runs against actual storage in
      // now-page.test.tsx, where this module is not mocked.
      expect(vi.mocked(putFocusSession)).toHaveBeenCalledTimes(2);
      for (const [, scopeKey] of vi.mocked(putFocusSession).mock.calls) {
        expect(scopeKey).toBe("user-123");
      }
    });

    it("local: migrating sessions does not mark check-ins or the journal as migrated", async () => {
      seedGuest();
      const store = createFocusSessionStore("local");

      await store.migrateGuestFocusSessions("user-123");

      expect(
        window.localStorage.getItem(
          guestMigrationMarker("user-123", "local", "focusSessions"),
        ),
      ).toBe("1");
      // The v0.4 check-in marker (no collection segment) and the v0.13
      // journal marker must both be untouched.
      expect(
        window.localStorage.getItem(guestMigrationMarker("user-123", "local")),
      ).toBeNull();
      expect(
        window.localStorage.getItem(
          guestMigrationMarker("user-123", "local", "journal"),
        ),
      ).toBeNull();
    });

    it("firestore: writes each copy to its own document id, keeping the record intact", async () => {
      mockFirebase({} as Firestore);
      seedGuest();

      const store = createFocusSessionStore(undefined, { signedIn: true });
      expect(store.backend).toBe("firestore");

      const result = await store.migrateGuestFocusSessions("user-123");

      expect(result).toEqual({ status: "migrated", migratedCount: 2 });
      expect(vi.mocked(putFirestoreFocusSession)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(putFirestoreFocusSession)).toHaveBeenCalledWith(
        expect.anything(),
        guestSessions[0],
        "user-123",
      );
      // addFirestoreFocusSession restamps, so using it here would be the bug.
      expect(vi.mocked(addFirestoreFocusSession)).not.toHaveBeenCalled();
      // The guest read is still local: a signed-out person has no cloud scope.
      expect(vi.mocked(listFocusSessions)).toHaveBeenCalledWith("guest");
      // No conflict guard, so no account-wide read is paid for on sign-in.
      expect(vi.mocked(listFirestoreFocusSessions)).not.toHaveBeenCalled();
    });

    it("firestore: a thrown Firestore write retries the whole copy locally", async () => {
      mockFirebase({} as Firestore);
      vi.mocked(putFirestoreFocusSession).mockRejectedValueOnce(
        new Error("permission-denied"),
      );
      seedGuest();

      const store = createFocusSessionStore(undefined, { signedIn: true });
      const result = await store.migrateGuestFocusSessions("user-123");

      // v0.28 clause 1 (MIGRATION_DESTINATION.md D2): the copy completed in
      // this browser, and the status now says so.
      expect(result).toEqual({ status: "migrated-locally", migratedCount: 2 });
      expect(vi.mocked(putFocusSession)).toHaveBeenCalledTimes(2);
      for (const [, scopeKey] of vi.mocked(putFocusSession).mock.calls) {
        expect(scopeKey).toBe("user-123");
      }
      // The failed firestore attempt left its own marker unset, so a later
      // online load can still sync; only the local marker is set here.
      expect(
        window.localStorage.getItem(
          guestMigrationMarker("user-123", "firestore", "focusSessions"),
        ),
      ).toBeNull();
      expect(
        window.localStorage.getItem(
          guestMigrationMarker("user-123", "local", "focusSessions"),
        ),
      ).toBe("1");
    });

    it("firestore-fallback: migrates locally when Firestore is unavailable", async () => {
      seedGuest();
      const store = createFocusSessionStore("firestore");
      expect(store.backend).toBe("firestore-fallback");

      const result = await store.migrateGuestFocusSessions("user-123");

      // v0.28 D2: firestore-RESOLVED, local writes - the destination is
      // reported even though live this adapter cannot carry a signed-in scope.
      expect(result).toEqual({ status: "migrated-locally", migratedCount: 2 });
      expect(vi.mocked(putFocusSession)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(putFirestoreFocusSession)).not.toHaveBeenCalled();
    });

    // v0.28 clause 2 (MIGRATION_DESTINATION.md D6): the D3 sentence's future
    // tense is the marker asymmetry, pinned rather than promised.
    it("firestore: the next load after a local landing still reaches the account", async () => {
      mockFirebase({} as Firestore);
      vi.mocked(putFirestoreFocusSession).mockRejectedValueOnce(
        new Error("permission-denied"),
      );
      seedGuest();

      const store = createFocusSessionStore(undefined, { signedIn: true });
      const first = await store.migrateGuestFocusSessions("user-123");
      expect(first.status).toBe("migrated-locally");

      const second = await store.migrateGuestFocusSessions("user-123");

      expect(second).toEqual({ status: "migrated", migratedCount: 2 });
      expect(vi.mocked(putFirestoreFocusSession)).toHaveBeenCalledTimes(3);
      for (const [, , scopeKey] of vi.mocked(putFirestoreFocusSession).mock.calls) {
        expect(scopeKey).toBe("user-123");
      }
      expect(
        window.localStorage.getItem(
          guestMigrationMarker("user-123", "firestore", "focusSessions"),
        ),
      ).toBe("1");
    });

    it("stays a no-op for a signed-out visitor", async () => {
      seedGuest();
      const store = createFocusSessionStore("local");

      const result = await store.migrateGuestFocusSessions("guest");

      expect(result).toEqual({ status: "skipped", migratedCount: 0 });
      expect(vi.mocked(putFocusSession)).not.toHaveBeenCalled();
    });

    it("stays silent, and writes nothing, for someone with no guest history", async () => {
      // The product guardrail: a person who never used the app signed out must
      // never be told about a migration, so this has to report `skipped`
      // rather than a zero-count `migrated`.
      seedGuest([]);
      const store = createFocusSessionStore("local");

      const result = await store.migrateGuestFocusSessions("user-123");

      expect(result).toEqual({ status: "skipped", migratedCount: 0 });
      expect(vi.mocked(putFocusSession)).not.toHaveBeenCalled();
    });
  });
});
