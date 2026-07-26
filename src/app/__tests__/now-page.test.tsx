import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NowPage from "@/app/now/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { listFocusSessions } from "@/lib/focus-session";
import { addFirestoreFocusSession } from "@/lib/firestore-focus-sessions";
import { getFirebaseFirestore } from "@/lib/firebase";
import { FOCUS_SESSION_COPY as C } from "@/lib/focus-session-copy";
import type { Firestore } from "firebase/firestore";

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirebaseFirestore: vi.fn(() => null),
}));

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
    vi.mocked(getFirebaseFirestore).mockReturnValue(null);
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
    vi.mocked(getFirebaseFirestore).mockReturnValue({} as Firestore);
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
    vi.mocked(getFirebaseFirestore).mockReturnValue({} as Firestore);
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
