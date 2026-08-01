/**
 * First direct coverage for `useCoachAuth`, the hook every route depends on.
 *
 * This is the oldest untested surface in the app (`src/app/hooks/use-coach-auth.ts`,
 * first committed 2026-06-27, last touched 2026-07-02). Twelve page and component
 * suites call `vi.mock("@/app/hooks/use-coach-auth")` and hand themselves an
 * object literal, so until now every assertion about signing in was an assertion
 * about a mock. The one guard that names the hook,
 * `src/__tests__/auth-message-contract.test.ts`, is a source SCAN: it proves the
 * identifiers `authMessage` and `signInWithGoogle` still exist and that pages
 * render the shared alert, but it never executes a line of the hook, so nothing
 * checked WHAT the hook puts in `authMessage` or WHEN.
 *
 * `@/lib/firebase-auth-errors` is deliberately left REAL. The messages asserted
 * below are produced by the same mapper that runs in production, so a test
 * cannot agree with itself about copy the user never sees.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";

const mockGetFirebaseAuth = vi.fn();
const mockGetFirebaseFirestore = vi.fn();
vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: () => mockGetFirebaseAuth(),
  getFirebaseFirestore: () => mockGetFirebaseFirestore(),
}));

const mockUpsertUserAccount = vi.fn();
vi.mock("@/lib/firestore-user", () => ({
  upsertUserAccount: (...args: unknown[]) => mockUpsertUserAccount(...args),
}));

const mockGetRedirectResult = vi.fn();
const mockOnAuthStateChanged = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSignInWithRedirect = vi.fn();
const mockSignOut = vi.fn();

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  getRedirectResult: (...args: unknown[]) => mockGetRedirectResult(...args),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signInWithRedirect: (...args: unknown[]) => mockSignInWithRedirect(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

/** Stand-in for the Firebase `Auth` instance; the hook only ever passes it on. */
const AUTH = { name: "auth-instance" };
/** Stand-in for the `Firestore` instance handed to `upsertUserAccount`. */
const DB = { name: "firestore-instance" };

function firebaseUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: "uid-1",
    email: "person@example.com",
    displayName: "A Person",
    ...overrides,
  };
}

/** The observer the hook registered, so a test can report an auth state change. */
let authStateObserver: ((user: unknown) => void | Promise<void>) | null = null;
let unsubscribe: ReturnType<typeof vi.fn>;

/** A Firestore rejection, which carries a Firestore code, never an `auth/` one. */
function firestoreFailure(code: string) {
  return Object.assign(new Error(`firestore: ${code}`), { code });
}

/** A Firebase Auth rejection, the only kind the sign-in copy is written for. */
function authFailure(code: string) {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
  authStateObserver = null;

  mockGetFirebaseAuth.mockReturnValue(AUTH);
  mockGetFirebaseFirestore.mockReturnValue(DB);
  mockGetRedirectResult.mockResolvedValue(null);
  mockUpsertUserAccount.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);

  unsubscribe = vi.fn();
  mockOnAuthStateChanged.mockImplementation((_auth: unknown, observer: never) => {
    authStateObserver = observer;
    return unsubscribe;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCoachAuth when Firebase is not configured", () => {
  beforeEach(() => {
    mockGetFirebaseAuth.mockReturnValue(null);
    mockGetFirebaseFirestore.mockReturnValue(null);
  });

  it("reports itself unconfigured and never subscribes to auth state", () => {
    const { result } = renderHook(() => useCoachAuth());

    expect(result.current.authConfigured).toBe(false);
    expect(result.current.authUser).toBeNull();
    expect(result.current.authMessage).toBe("");
    expect(mockOnAuthStateChanged).not.toHaveBeenCalled();
    expect(mockGetRedirectResult).not.toHaveBeenCalled();
  });

  it("explains that sign-in is unavailable instead of calling Firebase", async () => {
    const { result } = renderHook(() => useCoachAuth());

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(result.current.authMessage).toBe("Google login is not configured yet.");
    expect(mockSignInWithPopup).not.toHaveBeenCalled();
    expect(mockSignInWithRedirect).not.toHaveBeenCalled();
  });

  it("treats sign-out as a silent no-op rather than an error", async () => {
    const { result } = renderHook(() => useCoachAuth());

    await act(async () => {
      await result.current.signOutUser();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(result.current.authMessage).toBe("");
  });
});

describe("useCoachAuth auth-state subscription", () => {
  it("exposes the user the observer reports and marks itself configured", async () => {
    const { result } = renderHook(() => useCoachAuth());

    expect(result.current.authConfigured).toBe(true);
    expect(mockOnAuthStateChanged).toHaveBeenCalledWith(AUTH, expect.any(Function));

    const user = firebaseUser();
    await act(async () => {
      await authStateObserver?.(user);
    });

    expect(result.current.authUser).toBe(user);
  });

  it("records the account for a user who arrives already signed in", async () => {
    renderHook(() => useCoachAuth());

    await act(async () => {
      await authStateObserver?.(firebaseUser());
    });

    expect(mockUpsertUserAccount).toHaveBeenCalledWith(
      DB,
      "uid-1",
      "person@example.com",
      "A Person",
    );
  });

  it("substitutes empty contact details rather than passing undefined through", async () => {
    renderHook(() => useCoachAuth());

    await act(async () => {
      await authStateObserver?.(firebaseUser({ email: null, displayName: undefined }));
    });

    expect(mockUpsertUserAccount).toHaveBeenCalledWith(DB, "uid-1", "", null);
  });

  it("keeps a signed-in session usable when the account record cannot be written", async () => {
    // The account document is bookkeeping, not entitlement: the session is
    // already valid by the time it is attempted.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUpsertUserAccount.mockRejectedValue(firestoreFailure("permission-denied"));

    const { result } = renderHook(() => useCoachAuth());
    const user = firebaseUser();

    await act(async () => {
      await authStateObserver?.(user);
    });

    expect(result.current.authUser).toBe(user);
    expect(result.current.authMessage).toBe("");
    expect(consoleError).toHaveBeenCalled();
  });

  it("clears the user when the observer reports a sign-out", async () => {
    const { result } = renderHook(() => useCoachAuth());

    await act(async () => {
      await authStateObserver?.(firebaseUser());
    });
    await act(async () => {
      await authStateObserver?.(null);
    });

    expect(result.current.authUser).toBeNull();
    // Signing out must not send anyone else's details to Firestore.
    expect(mockUpsertUserAccount).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount so a stale observer cannot outlive the component", () => {
    const { unmount } = renderHook(() => useCoachAuth());

    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useCoachAuth popup sign-in", () => {
  it("announces nothing when the popup succeeds", async () => {
    mockSignInWithPopup.mockResolvedValue({ user: firebaseUser() });

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(result.current.authMessage).toBe("");
    expect(mockSignInWithRedirect).not.toHaveBeenCalled();
  });

  it("announces a genuine auth failure using the real message mapper", async () => {
    mockSignInWithPopup.mockRejectedValue(authFailure("auth/popup-closed-by-user"));

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(result.current.authMessage).toBe("Sign-in popup was closed before completion.");
    expect(mockSignInWithRedirect).not.toHaveBeenCalled();
  });

  it("falls back to redirect when the popup is blocked", async () => {
    mockSignInWithPopup.mockRejectedValue(authFailure("auth/popup-blocked"));
    mockSignInWithRedirect.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(mockSignInWithRedirect).toHaveBeenCalledTimes(1);
    expect(result.current.authMessage).toBe("Popup was blocked by the browser. Retrying with redirect...");
  });

  it("replaces the retry notice when the redirect fallback also fails", async () => {
    mockSignInWithPopup.mockRejectedValue(authFailure("auth/popup-blocked"));
    mockSignInWithRedirect.mockRejectedValue(authFailure("auth/network-request-failed"));

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(result.current.authMessage).toBe(
      "Network request failed during sign-in. Check connection and retry.",
    );
  });

  it("does not call Firestore when there is no configured database", async () => {
    mockGetFirebaseFirestore.mockReturnValue(null);
    mockSignInWithPopup.mockResolvedValue({ user: firebaseUser() });

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(mockUpsertUserAccount).not.toHaveBeenCalled();
    expect(result.current.authMessage).toBe("");
  });

  it("does not blame the login when the account record fails after a successful popup", async () => {
    // REGRESSION (bug found by this increment): `upsertUserAccount` sat inside
    // the same `try` as `signInWithPopup`, so a Firestore rejection was handed
    // to `authErrorMessage`, which has no case for a Firestore code and falls
    // through to its default. The person was signed in - the popup resolved and
    // the auth-state observer had already fired - yet the page told them
    // "Google login failed (unavailable)." and `/pricing` announced it in an
    // assertive live region. The same failure was already tolerated silently on
    // the auth-state path, so the app contradicted itself about one event.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSignInWithPopup.mockResolvedValue({ user: firebaseUser() });
    mockUpsertUserAccount.mockRejectedValue(firestoreFailure("unavailable"));

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(result.current.authMessage).toBe("");
    expect(mockSignInWithRedirect).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("useCoachAuth redirect result", () => {
  it("records the account for a user returning from a redirect", async () => {
    mockGetRedirectResult.mockResolvedValue({ user: firebaseUser({ uid: "uid-2" }) });

    renderHook(() => useCoachAuth());

    await waitFor(() => {
      expect(mockUpsertUserAccount).toHaveBeenCalledWith(
        DB,
        "uid-2",
        "person@example.com",
        "A Person",
      );
    });
  });

  it("announces a genuine redirect failure", async () => {
    mockGetRedirectResult.mockRejectedValue(authFailure("auth/unauthorized-domain"));

    const { result } = renderHook(() => useCoachAuth());

    await waitFor(() => {
      expect(result.current.authMessage).toBe(
        "Google login is blocked for this domain. Add rodmen07.github.io in Firebase Authentication authorized domains.",
      );
    });
  });

  it("does not blame the login when the account record fails after a redirect", async () => {
    // REGRESSION (same bug, second path): the `.catch` on the redirect chain
    // covered the `upsertUserAccount` inside its own `.then`, so a Firestore
    // rejection surfaced as "Google login failed (permission-denied)." on a
    // sign-in that had in fact succeeded.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetRedirectResult.mockResolvedValue({ user: firebaseUser() });
    mockUpsertUserAccount.mockRejectedValue(firestoreFailure("permission-denied"));

    const { result } = renderHook(() => useCoachAuth());

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });
    expect(result.current.authMessage).toBe("");
  });
});

describe("useCoachAuth sign-out", () => {
  it("signs out and clears any message left over from a failed attempt", async () => {
    mockSignInWithPopup.mockRejectedValue(authFailure("auth/popup-closed-by-user"));

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signInWithGoogle();
    });
    expect(result.current.authMessage).not.toBe("");

    await act(async () => {
      await result.current.signOutUser();
    });

    expect(mockSignOut).toHaveBeenCalledWith(AUTH);
    expect(result.current.authMessage).toBe("");
  });

  it("says so when signing out fails", async () => {
    mockSignOut.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useCoachAuth());
    await act(async () => {
      await result.current.signOutUser();
    });

    expect(result.current.authMessage).toBe("Could not sign out right now.");
  });
});
