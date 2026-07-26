import { createFocusSessionStore } from "@/lib/focus-session-store";
import { addFocusSession, listFocusSessions } from "@/lib/focus-session";
import {
  addFirestoreFocusSession,
  listFirestoreFocusSessions,
} from "@/lib/firestore-focus-sessions";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";
import type { FocusSession } from "@/lib/focus-session";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  getFirebaseFirestore: vi.fn(() => null),
}));

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
    vi.mocked(getFirebaseFirestore).mockReturnValue(null);
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
    vi.mocked(getFirebaseFirestore).mockReturnValue({} as Firestore);
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
    vi.mocked(getFirebaseFirestore).mockReturnValue({} as Firestore);
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
    // getFirebaseFirestore returns null via the beforeEach default here, i.e.
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
    vi.mocked(getFirebaseFirestore).mockReturnValue({} as Firestore);
    const store = createFocusSessionStore("local", { signedIn: true });
    expect(store.backend).toBe("local");

    await store.addFocusSession(input, "user-123");

    expect(vi.mocked(addFocusSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addFirestoreFocusSession)).not.toHaveBeenCalled();
  });
});
