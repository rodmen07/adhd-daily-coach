import { useEffect, useMemo, useState } from "react";
import {
  isFirebaseConfigured,
  loadFirebaseAuth,
  loadFirebaseFirestore,
} from "@/lib/firebase";
import { upsertUserAccount } from "@/lib/firestore-user";
import {
  authErrorMessage,
  shouldFallbackToRedirect,
} from "@/lib/firebase-auth-errors";
import type { Auth, User } from "firebase/auth";

/**
 * Writes the account bookkeeping document for a user who is already signed in.
 *
 * It deliberately swallows its own failure. By the time this runs the session is
 * valid - the popup resolved, or the auth-state observer reported a user - so a
 * Firestore outage or a rules rejection is not a sign-in problem and must not be
 * dressed up as one. It used to be: this write sat inside the same `try` as
 * `signInWithPopup` and inside the redirect chain's `.catch`, so a Firestore
 * rejection reached `authErrorMessage`, which has no case for a Firestore code
 * and falls through to "Google login failed (<code>).". The person was signed in
 * and being told the opposite, in an assertive live region on `/pricing`.
 *
 * The auth-state path always made this choice; keeping all three callers on one
 * helper is what stops them from disagreeing about the same event again.
 */
async function recordAccount(user: User): Promise<void> {
  const db = await loadFirebaseFirestore().catch(() => null);
  if (!db) {
    return;
  }

  try {
    await upsertUserAccount(db, user.uid, user.email ?? "", user.displayName ?? null);
  } catch (error) {
    console.error("Failed to record the user account:", error);
  }
}

/**
 * The Auth client for a user-initiated flow, or null when Firebase is not
 * configured or the SDK chunk cannot be fetched. The two failure modes get one
 * answer because the caller's honest copy for both is the same: sign-in is not
 * available right now.
 */
async function loadAuthOrNull(): Promise<Auth | null> {
  return loadFirebaseAuth().catch(() => null);
}

type AuthSdk = typeof import("firebase/auth");

let authSdkPromise: Promise<AuthSdk> | null = null;

/**
 * The `firebase/auth` module through ONE shared import expression. Every
 * consumer in this file resolves the SDK here rather than writing its own
 * `import("firebase/auth")`, for two reasons: repeated call sites share one
 * in-flight promise instead of re-entering the module loader, and a single
 * expression is the only shape whose resolution is guaranteed identical for
 * every caller - under vitest, sibling dynamic-import expressions of the same
 * specifier in one module have resolved to DIFFERENT modules (the first to the
 * `vi.mock` factory, a later one to the real SDK, observed 2026-08-01), which
 * made the popup path hit the real `signInWithPopup` under jsdom. A rejected
 * load clears the cache so a transient chunk-fetch failure can be retried.
 */
function loadAuthSdk(): Promise<AuthSdk> {
  authSdkPromise ??= import("firebase/auth").catch((error: unknown) => {
    authSdkPromise = null;
    throw error;
  });
  return authSdkPromise;
}

export function useCoachAuth() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  // A synchronous config read, not an SDK probe: the SDK loads lazily inside
  // the effect below (v0.19 PR3, D4 in docs/design/PERF_PASS.md), so the
  // first render must not wait on it and must not download it either.
  const authConfigured = useMemo(() => isFirebaseConfigured(), []);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      return;
    }

    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const auth = await loadAuthOrNull();
      if (!auth || disposed) {
        return;
      }

      const { getRedirectResult, onAuthStateChanged } = await loadAuthSdk();
      if (disposed) {
        return;
      }

      getRedirectResult(auth)
        .then(async (result) => {
          if (result?.user) {
            await recordAccount(result.user);
          }
        })
        .catch((error: unknown) => {
          // Only a genuine redirect failure reaches here now: `recordAccount`
          // handles its own, so this `.catch` cannot mislabel a Firestore fault.
          setAuthMessage(authErrorMessage(error));
        });

      unsubscribe = onAuthStateChanged(auth, async (user) => {
        setAuthUser(user);
        if (user) {
          await recordAccount(user);
        }
      });
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  async function signInWithGoogle() {
    const auth = await loadAuthOrNull();
    if (!auth) {
      setAuthMessage("Google login is not configured yet.");
      return;
    }

    setAuthMessage("");
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } =
      await loadAuthSdk();
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await recordAccount(result.user);
      }
    } catch (error: unknown) {
      // `recordAccount` never throws, so everything caught here really is an
      // authentication failure and the copy below is honest about it.
      const message = authErrorMessage(error);

      if (shouldFallbackToRedirect(error)) {
        setAuthMessage(message);
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError: unknown) {
          setAuthMessage(authErrorMessage(redirectError));
          return;
        }
      }

      setAuthMessage(message);
    }
  }

  async function signOutUser() {
    const auth = await loadAuthOrNull();
    if (!auth) {
      return;
    }

    const { signOut } = await loadAuthSdk();

    try {
      await signOut(auth);
      setAuthMessage("");
    } catch {
      setAuthMessage("Could not sign out right now.");
    }
  }

  return {
    authUser,
    authMessage,
    authConfigured,
    signInWithGoogle,
    signOutUser,
  };
}
