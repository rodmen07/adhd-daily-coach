import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NowPage from "@/app/now/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { addFocusSession, listFocusSessions } from "@/lib/focus-session";
import {
  addFirestoreFocusSession,
  putFirestoreFocusSession,
} from "@/lib/firestore-focus-sessions";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import { FOCUS_SESSION_COPY as C } from "@/lib/focus-session-copy";
import type { Firestore } from "firebase/firestore";

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => null),
}));

/** One switch for both halves of the v0.19 PR3 surface: the sync config
 * probe the store factory reads and the lazy client its adapters await. */
function mockFirebase(db: Firestore | null) {
  vi.mocked(isFirebaseConfigured).mockReturnValue(db !== null);
  vi.mocked(loadFirebaseFirestore).mockResolvedValue(db);
}

vi.mock("@/lib/firestore-focus-sessions", () => ({
  addFirestoreFocusSession: vi.fn(() =>
    Promise.resolve({
      id: "firestore-session",
      task: "write the summary",
      plannedMinutes: 5,
      focusedSeconds: 0,
      outcome: "wrapped-up" as const,
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    }),
  ),
  listFirestoreFocusSessions: vi.fn(() => Promise.resolve([])),
  putFirestoreFocusSession: vi.fn((_db: unknown, stored: unknown) =>
    Promise.resolve(stored),
  ),
}));

vi.mock("@/lib/reminder-notifications", () => ({
  showNotification: vi.fn(),
}));

/** The account-scoped key `putFocusSession` writes a copied session to. */
const ACCOUNT_SESSIONS_KEY = "calm-daily-coach-focus-sessions:user-123";

let storageWriteSpy: { mockRestore: () => void } | null = null;

/**
 * Make ONE localStorage key unwritable, the way a full quota or a browser with
 * storage turned off does. Every other key keeps working, so the only thing
 * that fails is the write under test - a broad `setItem` stub would also break
 * the idempotency marker and the page's own state and prove far less.
 */
function failWritesTo(key: string) {
  const real = Storage.prototype.setItem;
  storageWriteSpy = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (this: Storage, writtenKey: string, value: string) {
      if (writtenKey === key) {
        throw new DOMException("exceeded the quota", "QuotaExceededError");
      }
      real.call(this, writtenKey, value);
    });
}

const guestAuthMock = {
  authUser: null,
  authMessage: "",
  authConfigured: false,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

const signedInAuthMock = {
  authUser: { uid: "user-123", email: "person@example.com" },
  authMessage: "",
  authConfigured: true,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

/** setup -> running -> closed out, the only path that records a session. */
function runOneSession(task: string) {
  fireEvent.change(screen.getByLabelText(C.taskLabel), { target: { value: task } });
  fireEvent.click(screen.getByRole("button", { name: C.start }));
  fireEvent.click(screen.getByRole("button", { name: C.wrapUp }));
}

// /now shipped in PR #104 with no page-level test at all; v0.12 PR2 moves its
// reads and writes from direct focus-session.ts calls onto the backend-
// resolving store, so these assert the wiring end to end rather than the
// store in isolation. A page that renders perfectly while recording nothing
// is exactly the "shipped surface that silently does nothing" class.
describe("Now page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFirebase(null);
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);
  });

  afterEach(() => {
    // Restore before cleanup so a test that threw mid-way never leaks a
    // storage stub into the next one.
    storageWriteSpy?.mockRestore();
    storageWriteSpy = null;
    cleanup();
    vi.clearAllMocks();
  });

  it("records a guest's closed-out session locally and refreshes today's tally", async () => {
    render(<NowPage />);

    runOneSession("write the summary");

    expect(await screen.findByText(C.wrappedUpNote)).toBeTruthy();
    // The session reached storage under the guest scope, through the adapter.
    await waitFor(() => {
      expect(listFocusSessions("guest")).toHaveLength(1);
    });
    expect(listFocusSessions("guest")[0].task).toBe("write the summary");
    expect(listFocusSessions("guest")[0].outcome).toBe("wrapped-up");
    // The done screen opens on the zero-state recap and only shows a real
    // count once the post-write refresh lands, so this fails if either the
    // write or the refresh is unwired (it would sit on C.emptyToday forever).
    expect(await screen.findByText(/across 1 session\./)).toBeTruthy();
    expect(screen.queryByText(C.emptyToday)).toBeNull();
  });

  it("writes a signed-in person's session to Firestore instead of this browser", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    render(<NowPage />);

    runOneSession("write the summary");

    await waitFor(() => {
      expect(vi.mocked(addFirestoreFocusSession)).toHaveBeenCalledTimes(1);
    });
    const [, input, scope] = vi.mocked(addFirestoreFocusSession).mock.calls[0];
    expect(input.task).toBe("write the summary");
    expect(input.outcome).toBe("wrapped-up");
    expect(scope).toBe("user-123");
    // Not silently double-written to this browser as well.
    expect(listFocusSessions("user-123")).toHaveLength(0);
  });

  it("still records the session locally when the Firestore write fails", async () => {
    // A closed-out session is the one thing this feature promises to keep; a
    // permission-denied write must not drop it on the floor.
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    vi.mocked(addFirestoreFocusSession).mockRejectedValueOnce(
      new Error("permission-denied"),
    );
    render(<NowPage />);

    runOneSession("write the summary");

    await waitFor(() => {
      expect(listFocusSessions("user-123")).toHaveLength(1);
    });
    expect(screen.getByText(C.wrappedUpNote)).toBeTruthy();
  });

  // v0.13 (docs/design/GUEST_DATA_MIGRATION.md section 3.2). These run against
  // REAL local storage - `@/lib/focus-session` is not mocked in this file - so
  // they prove the copy actually lands and the guest records actually survive,
  // rather than proving a mock returned what it was told to.
  it("brings sessions recorded signed out along on first signed-in load", async () => {
    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);

    render(<NowPage />);

    // The tally is the observable consequence: 1500s = 25 minutes, and it can
    // only appear here if the guest session reached the user-123 scope before
    // the read that feeds it.
    await waitFor(() => {
      expect(listFocusSessions("user-123")).toHaveLength(1);
    });
    expect(listFocusSessions("user-123")[0].task).toBe("guest work");
    // Verbatim, not restamped: the copied record keeps its original id.
    expect(listFocusSessions("user-123")[0].id).toBe(listFocusSessions("guest")[0].id);
    // D4: the guest copy is never deleted, so nothing is lost if this browser
    // is later used signed out again.
    expect(listFocusSessions("guest")).toHaveLength(1);
    expect(await screen.findByTestId("focus-migration-note")).toBeTruthy();
    expect(screen.getByTestId("focus-migration-note").textContent).toBe(C.migrationNote);
  });

  it("copies once, then stays silent on every later load", async () => {
    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);

    const first = render(<NowPage />);
    await waitFor(() => {
      expect(listFocusSessions("user-123")).toHaveLength(1);
    });
    first.unmount();

    render(<NowPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(C.taskLabel)).toBeTruthy();
    });
    // The marker short-circuits the second run, so no duplicate arrives and
    // no second announcement is made.
    expect(listFocusSessions("user-123")).toHaveLength(1);
    expect(screen.queryByTestId("focus-migration-note")).toBeNull();
  });

  it("says nothing to someone who never used the app signed out", async () => {
    // The product guardrail (GUEST_DATA_MIGRATION.md section 4): silence when
    // there is nothing to move.
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);

    render(<NowPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(C.taskLabel)).toBeTruthy();
    });
    expect(screen.queryByTestId("focus-migration-note")).toBeNull();
  });

  it("copies a signed-in person's guest sessions into Firestore, keeping their ids", async () => {
    const guestSession = addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);

    render(<NowPage />);

    await waitFor(() => {
      expect(vi.mocked(putFirestoreFocusSession)).toHaveBeenCalledTimes(1);
    });
    const [, copied, scope] = vi.mocked(putFirestoreFocusSession).mock.calls[0];
    // The id is the document id, which is what makes a retried copy land on
    // the same document instead of duplicating the session.
    expect(copied.id).toBe(guestSession.id);
    expect(copied.task).toBe("guest work");
    expect(scope).toBe("user-123");
    // addFirestoreFocusSession would have restamped the record.
    expect(vi.mocked(addFirestoreFocusSession)).not.toHaveBeenCalled();
  });

  // v0.21 PR2 (docs/design/STATUS_VOCABULARY.md D4). Before this, the page
  // rendered ONLY `migrationStatus.type === "ok"` and the effect only ever SET
  // "ok", so a copy that could not be made left the person with nothing on
  // screen and nothing announced - the same silent shape the /focus +
  // /pricing sign-in bug had. Both halves matter: setting the state and
  // rendering it. Observed failing against origin/main before the fix landed.
  //
  // The failure injected here is the storage write, NOT a Firestore
  // rejection, because a rejected Firestore write does not reach this branch:
  // `focus-session-store.ts:192` deliberately falls back to the LOCAL
  // migration on `error`, which then succeeds and reports "migrated". The
  // only way `migrateGuestFocusSessions` returns `error` is the local write
  // failing too - a full or disabled localStorage - which is exactly the
  // condition where the sessions really are not where the person expects.
  // v0.28 (docs/design/MIGRATION_DESTINATION.md D3/D4). Between "here now" and
  // "could not be copied" sits the outcome neither described: the copy RAN and
  // completed, but a thrown Firestore write sent it to the local twin, so the
  // sessions are in this browser while the success line implied the account.
  // Observed failing against origin/main before the fix landed - the page had
  // no notice branch at all and rendered `migrationNote`.
  it("tells a signed-in person when the copy landed in this browser instead", async () => {
    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    vi.mocked(putFirestoreFocusSession).mockRejectedValueOnce(
      new DOMException("permission-denied", "FirebaseError"),
    );

    render(<NowPage />);

    const note = await screen.findByTestId("focus-migration-local");
    // Composed from a literal, not from the copy module the page imports: a
    // shared constant on both sides would agree with itself (L-054).
    expect(note.textContent).toBe(
      "Your earlier focus sessions are safe in this browser. They will be copied to your account next time it can be reached.",
    );
    // D4: nothing failed and nothing is asked of the person, so the line waits
    // for a pause in the reading order rather than interrupting.
    expect(note.getAttribute("role")).toBeNull();
    expect(note.getAttribute("aria-live")).toBe("polite");
    expect(note.className).toContain("text-amber-700");
    // Neither of the two sentences this one replaces may appear beside it.
    expect(screen.queryByTestId("focus-migration-note")).toBeNull();
    expect(screen.queryByTestId("focus-migration-error")).toBeNull();
    // The sessions really are in the local account scope, which is what the
    // sentence claims.
    expect(listFocusSessions("user-123")).toHaveLength(1);
    expect(listFocusSessions("guest")).toHaveLength(1);
  });

  it("tells a signed-in person, assertively, when the copy could not be made", async () => {
    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    failWritesTo(ACCOUNT_SESSIONS_KEY);

    render(<NowPage />);

    const note = await screen.findByTestId("focus-migration-error");
    expect(note.textContent).toBe(C.migrationErrorNote);
    // A failed copy is the one migration outcome a person may need to act on,
    // so it interrupts rather than waiting for a pause in the reading order.
    expect(note.getAttribute("role")).toBe("alert");
    expect(note.getAttribute("aria-live")).toBe("assertive");
    // The success line never appears alongside it.
    expect(screen.queryByTestId("focus-migration-note")).toBeNull();
    // Nothing was lost: the guest copy is still exactly where it was, which is
    // what the copy promises the person.
    expect(listFocusSessions("guest")).toHaveLength(1);
  });

  it("never records a session that was only abandoned, not closed out", async () => {
    // The product rule NF-6 enforces by design: navigating away leaves no
    // "you gave up" record. Unmounting mid-session must write nothing.
    const view = render(<NowPage />);

    fireEvent.change(screen.getByLabelText(C.taskLabel), {
      target: { value: "write the summary" },
    });
    fireEvent.click(screen.getByRole("button", { name: C.start }));
    view.unmount();

    expect(listFocusSessions("guest")).toHaveLength(0);
  });
});
