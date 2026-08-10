import { createCheckinStore, resolveCheckinBackend } from "@/lib/checkin-store";
import {
  addCheckin,
  getWeeklySummary,
  listCheckins,
  listCheckinsInRange,
} from "@/lib/browser-checkins";
import {
  addFirestoreCheckin,
  getFirestoreCheckinsInRange,
  getFirestoreWeeklySummary,
} from "@/lib/firestore-checkins";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import { guestMigrationMarker } from "@/lib/guest-migration";
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

vi.mock("@/lib/browser-checkins", () => ({
  addCheckin: vi.fn(),
  listCheckins: vi.fn(() => []),
  listCheckinsInRange: vi.fn(() => []),
  getWeeklySummary: vi.fn(() => ({
    windowStart: "2026-06-21",
    windowEnd: "2026-06-27",
    total: 0,
    done: 0,
    skipped: 0,
    completionRate: 0,
    byFocus: {
      Career: { done: 0, skipped: 0 },
      Communication: { done: 0, skipped: 0 },
      Creativity: { done: 0, skipped: 0 },
      "Deep Work": { done: 0, skipped: 0 },
      Finances: { done: 0, skipped: 0 },
      Fitness: { done: 0, skipped: 0 },
      Home: { done: 0, skipped: 0 },
      Learning: { done: 0, skipped: 0 },
      Mindfulness: { done: 0, skipped: 0 },
      Nutrition: { done: 0, skipped: 0 },
      Organization: { done: 0, skipped: 0 },
      Relationships: { done: 0, skipped: 0 },
      Sleep: { done: 0, skipped: 0 },
    },
  })),
}));

vi.mock("@/lib/firestore-checkins", () => ({
  addFirestoreCheckin: vi.fn(),
  getFirestoreCheckinsInRange: vi.fn(() => Promise.resolve([])),
  getFirestoreWeeklySummary: vi.fn(() =>
    Promise.resolve({
      windowStart: "2026-06-21",
      windowEnd: "2026-06-27",
      total: 0,
      done: 0,
      skipped: 0,
      completionRate: 0,
      byFocus: {
        Career: { done: 0, skipped: 0 },
        Communication: { done: 0, skipped: 0 },
        Creativity: { done: 0, skipped: 0 },
        "Deep Work": { done: 0, skipped: 0 },
        Finances: { done: 0, skipped: 0 },
        Fitness: { done: 0, skipped: 0 },
        Home: { done: 0, skipped: 0 },
        Learning: { done: 0, skipped: 0 },
        Mindfulness: { done: 0, skipped: 0 },
        Nutrition: { done: 0, skipped: 0 },
        Organization: { done: 0, skipped: 0 },
        Relationships: { done: 0, skipped: 0 },
        Sleep: { done: 0, skipped: 0 },
      },
    }),
  ),
}));

describe("checkin-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirebase(null);
    window.localStorage.clear();
  });

  it("resolves local mode by default when signed out or unconfigured", () => {
    expect(resolveCheckinBackend(undefined)).toBe("local");
    expect(resolveCheckinBackend("LOCAL")).toBe("local");
  });

  it("resolves firestore mode explicitly", () => {
    expect(resolveCheckinBackend("firestore")).toBe("firestore");
    expect(resolveCheckinBackend("FIRESTORE")).toBe("firestore");
  });

  describe("backend resolution matrix (unset env default)", () => {
    it("auto-resolves to firestore only when configured and signed in", () => {
      expect(
        resolveCheckinBackend(undefined, { firebaseConfigured: true, signedIn: true }),
      ).toBe("firestore");
    });

    it("auto-resolves to local when configured but signed out", () => {
      expect(
        resolveCheckinBackend(undefined, { firebaseConfigured: true, signedIn: false }),
      ).toBe("local");
    });

    it("auto-resolves to local when signed in but unconfigured", () => {
      expect(
        resolveCheckinBackend(undefined, { firebaseConfigured: false, signedIn: true }),
      ).toBe("local");
    });

    it("auto-resolves to local when unconfigured and signed out", () => {
      expect(
        resolveCheckinBackend(undefined, { firebaseConfigured: false, signedIn: false }),
      ).toBe("local");
    });

    it("treats empty and whitespace-only values as unset", () => {
      expect(
        resolveCheckinBackend("", { firebaseConfigured: true, signedIn: true }),
      ).toBe("firestore");
      expect(
        resolveCheckinBackend("   ", { firebaseConfigured: true, signedIn: true }),
      ).toBe("firestore");
    });

    it("defaults signedIn to false when the context omits it", () => {
      expect(resolveCheckinBackend(undefined, { firebaseConfigured: true })).toBe("local");
    });

    it("derives firebaseConfigured from the Firebase module when omitted", () => {
      expect(resolveCheckinBackend(undefined, { signedIn: true })).toBe("local");

      mockFirebase({} as Firestore);
      expect(resolveCheckinBackend(undefined, { signedIn: true })).toBe("firestore");
    });

    it("lets an explicit local setting override a signed-in configured session", () => {
      expect(
        resolveCheckinBackend("local", { firebaseConfigured: true, signedIn: true }),
      ).toBe("local");
      expect(
        resolveCheckinBackend("LOCAL", { firebaseConfigured: true, signedIn: true }),
      ).toBe("local");
    });

    it("keeps an explicit firestore setting even when signed out or unconfigured", () => {
      expect(
        resolveCheckinBackend("firestore", { firebaseConfigured: false, signedIn: false }),
      ).toBe("firestore");
    });

    it("forces local for unrecognized values", () => {
      expect(
        resolveCheckinBackend("sqlite", { firebaseConfigured: true, signedIn: true }),
      ).toBe("local");
    });
  });

  it("creates the firestore adapter under the automatic default for a signed-in user", () => {
    mockFirebase({} as Firestore);

    const store = createCheckinStore(undefined, { signedIn: true });

    expect(store.backend).toBe("firestore");
  });

  it("creates the local adapter under the automatic default when signed out", () => {
    mockFirebase({} as Firestore);

    const store = createCheckinStore(undefined, { signedIn: false });

    expect(store.backend).toBe("local");
  });

  it("creates the local adapter (not firestore-fallback) under the automatic default when Firebase is unconfigured", () => {
    const store = createCheckinStore(undefined, { signedIn: true });

    expect(store.backend).toBe("local");
  });

  it("creates local adapter when backend is local", async () => {
    const store = createCheckinStore("local");

    expect(store.backend).toBe("local");
    await store.addCheckin(
      {
        date: "2026-06-27",
        focus: "Deep Work",
        dose: "light",
        minutes: 5,
        status: "done",
      },
      "guest",
    );

    expect(vi.mocked(addCheckin)).toHaveBeenCalledTimes(1);
  });

  it("uses local fallback adapter when firestore mode is requested but not configured", async () => {
    const store = createCheckinStore("firestore");

    expect(store.backend).toBe("firestore-fallback");
    await store.getWeeklySummary(undefined, "guest");
    expect(vi.mocked(getWeeklySummary)).toHaveBeenCalledTimes(1);
  });

  it("uses Firestore adapter when configured", async () => {
    mockFirebase({} as Firestore);
    const store = createCheckinStore("firestore");

    expect(store.backend).toBe("firestore");
    await store.addCheckin(
      {
        date: "2026-06-27",
        focus: "Deep Work",
        dose: "light",
        minutes: 5,
        status: "done",
      },
      "guest",
    );

    await store.getWeeklySummary(undefined, "guest");

    expect(vi.mocked(addFirestoreCheckin)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getFirestoreWeeklySummary)).toHaveBeenCalledTimes(1);
  });

  it("falls back to a local write when the Firestore write fails", async () => {
    mockFirebase({} as Firestore);
    vi.mocked(addFirestoreCheckin).mockRejectedValueOnce(new Error("offline"));

    const store = createCheckinStore(undefined, { signedIn: true });
    await store.addCheckin(
      {
        date: "2026-06-27",
        focus: "Deep Work",
        dose: "light",
        minutes: 5,
        status: "done",
      },
      "user-123",
    );

    expect(vi.mocked(addFirestoreCheckin)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addCheckin)).toHaveBeenCalledTimes(1);
  });

  it("falls back to the local weekly summary when the Firestore read fails", async () => {
    mockFirebase({} as Firestore);
    vi.mocked(getFirestoreWeeklySummary).mockRejectedValueOnce(new Error("offline"));

    const store = createCheckinStore(undefined, { signedIn: true });
    const summary = await store.getWeeklySummary(undefined, "user-123");

    expect(vi.mocked(getWeeklySummary)).toHaveBeenCalledTimes(1);
    expect(summary.total).toBe(0);
  });

  describe("getCheckinsInRange (v0.11 Trends)", () => {
    const fakeInRangeCheckin = {
      id: "1",
      createdAt: "2026-07-01T10:00:00.000Z",
      date: "2026-07-01",
      focus: "Deep Work" as const,
      dose: "medium" as const,
      minutes: 15,
      status: "done" as const,
    };

    it("reads the local range function under the local backend", async () => {
      vi.mocked(listCheckinsInRange).mockReturnValueOnce([fakeInRangeCheckin]);

      const store = createCheckinStore("local");
      const result = await store.getCheckinsInRange(28, undefined, "guest");

      expect(vi.mocked(listCheckinsInRange)).toHaveBeenCalledWith(28, undefined, "guest");
      expect(result).toEqual([fakeInRangeCheckin]);
      expect(vi.mocked(getFirestoreCheckinsInRange)).not.toHaveBeenCalled();
    });

    it("uses the local fallback adapter's range read when firestore mode is requested but not configured", async () => {
      vi.mocked(listCheckinsInRange).mockReturnValueOnce([fakeInRangeCheckin]);

      const store = createCheckinStore("firestore");
      expect(store.backend).toBe("firestore-fallback");

      const result = await store.getCheckinsInRange(28, undefined, "guest");

      expect(vi.mocked(listCheckinsInRange)).toHaveBeenCalledTimes(1);
      expect(result).toEqual([fakeInRangeCheckin]);
    });

    it("reads the Firestore range function under the firestore backend", async () => {
      mockFirebase({} as Firestore);
      vi.mocked(getFirestoreCheckinsInRange).mockResolvedValueOnce([fakeInRangeCheckin]);

      const store = createCheckinStore(undefined, { signedIn: true });
      expect(store.backend).toBe("firestore");

      const result = await store.getCheckinsInRange(28, undefined, "user-123");

      expect(vi.mocked(getFirestoreCheckinsInRange)).toHaveBeenCalledWith(
        expect.anything(),
        28,
        undefined,
        "user-123",
      );
      expect(vi.mocked(listCheckinsInRange)).not.toHaveBeenCalled();
      expect(result).toEqual([fakeInRangeCheckin]);
    });

    it("falls back to the local range read when the Firestore range read throws", async () => {
      mockFirebase({} as Firestore);
      vi.mocked(getFirestoreCheckinsInRange).mockRejectedValueOnce(new Error("offline"));
      vi.mocked(listCheckinsInRange).mockReturnValueOnce([fakeInRangeCheckin]);

      const store = createCheckinStore(undefined, { signedIn: true });
      const result = await store.getCheckinsInRange(28, undefined, "user-123");

      expect(vi.mocked(getFirestoreCheckinsInRange)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(listCheckinsInRange)).toHaveBeenCalledTimes(1);
      expect(result).toEqual([fakeInRangeCheckin]);
    });
  });

  const guestCheckin = {
    id: "1",
    createdAt: "2026-06-27T10:00:00.000Z",
    date: "2026-06-27",
    focus: "Deep Work",
    dose: "light",
    minutes: 5,
    status: "done",
  } as const;

  it("retries migration locally when the Firestore migration fails", async () => {
    mockFirebase({} as Firestore);
    vi.mocked(addFirestoreCheckin).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(listCheckins).mockReturnValue([{ ...guestCheckin }]);

    const store = createCheckinStore(undefined, { signedIn: true });
    const result = await store.migrateGuestCheckins("user-123");

    // v0.28 clause 1 (MIGRATION_DESTINATION.md D2). The retry is still correct
    // - a thrown Firestore write must not strand half a history - but it
    // landed in this browser, and reporting plain "migrated" is what let `/`
    // say "Migrated 1 guest check-in to your account."
    expect(result.status).toBe("migrated-locally");
    expect(result.migratedCount).toBe(1);
    expect(vi.mocked(addCheckin)).toHaveBeenCalledTimes(1);
    // The records are in the local TARGET scope, not left in guest.
    expect(vi.mocked(addCheckin).mock.calls[0]?.[1]).toBe("user-123");
    // Asserted on the marker keys themselves, not inferred from the status:
    // only the local backend's marker is written, which is what makes the
    // next load retry the cloud copy (D6).
    expect(
      window.localStorage.getItem(guestMigrationMarker("user-123", "firestore")),
    ).toBeNull();
    expect(
      window.localStorage.getItem(guestMigrationMarker("user-123", "local")),
    ).toBe("1");
  });

  // v0.28 clause 2 (MIGRATION_DESTINATION.md D6): D3's sentence promises the
  // copy "will be copied to your account next time it can be reached". That
  // promise is the marker asymmetry above, so it is pinned by a test rather
  // than asserted in prose.
  it("still reaches the account on the load after a local landing", async () => {
    mockFirebase({} as Firestore);
    vi.mocked(addFirestoreCheckin).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(listCheckins).mockReturnValue([{ ...guestCheckin }]);

    const store = createCheckinStore(undefined, { signedIn: true });
    const first = await store.migrateGuestCheckins("user-123");
    expect(first.status).toBe("migrated-locally");

    // Second load, cloud write working this time.
    const second = await store.migrateGuestCheckins("user-123");

    expect(second.status).toBe("migrated");
    expect(second.migratedCount).toBe(1);
    // Written to the account scope, which is what the sentence promised.
    expect(vi.mocked(addFirestoreCheckin)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(addFirestoreCheckin).mock.calls[1]?.[2]).toBe("user-123");
    expect(
      window.localStorage.getItem(guestMigrationMarker("user-123", "firestore")),
    ).toBe("1");
  });

  it("reports a firestore-fallback copy as landing in this browser", async () => {
    // Explicit firestore setting with Firebase unconfigured: a
    // firestore-RESOLVED adapter whose writes are local (D2).
    vi.mocked(listCheckins).mockReturnValue([{ ...guestCheckin }]);

    const store = createCheckinStore("firestore");
    expect(store.backend).toBe("firestore-fallback");

    const result = await store.migrateGuestCheckins("user-123");

    expect(result.status).toBe("migrated-locally");
    expect(result.migratedCount).toBe(1);
    expect(vi.mocked(addFirestoreCheckin)).not.toHaveBeenCalled();
  });

  it("leaves a plain local backend saying plain migrated", async () => {
    // D2's exclusion, held by a test so the mapping cannot creep: with no
    // cloud configured the browser is the destination by CONFIGURATION, and
    // "will be copied to your account" would promise a cloud that does not
    // exist.
    vi.mocked(listCheckins).mockReturnValue([{ ...guestCheckin }]);

    const store = createCheckinStore("local");
    const result = await store.migrateGuestCheckins("user-123");

    expect(result.status).toBe("migrated");
    expect(result.migratedCount).toBe(1);
  });

  it("migrates guest checkins into signed-in scope once", async () => {
    vi.mocked(listCheckins).mockReturnValue([
      {
        id: "1",
        createdAt: "2026-06-27T10:00:00.000Z",
        date: "2026-06-27",
        focus: "Deep Work",
        dose: "light",
        minutes: 5,
        status: "done",
      },
    ]);

    const store = createCheckinStore("local");
    const first = await store.migrateGuestCheckins("user-123");
    const second = await store.migrateGuestCheckins("user-123");

    expect(first.status).toBe("migrated");
    expect(first.migratedCount).toBe(1);
    expect(second.status).toBe("already-migrated");
    expect(vi.mocked(addCheckin)).toHaveBeenCalledTimes(1);
  });

  it("skips migration for guest scope", async () => {
    const store = createCheckinStore("local");
    const result = await store.migrateGuestCheckins("guest");

    expect(result.status).toBe("skipped");
    expect(result.migratedCount).toBe(0);
  });
});