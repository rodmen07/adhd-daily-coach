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
