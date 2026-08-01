import { useEffect, useMemo, useState } from "react";
import { getFirebaseAuth, getFirebaseFirestore } from "@/lib/firebase";
import { upsertUserAccount } from "@/lib/firestore-user";
import {
  authErrorMessage,
  shouldFallbackToRedirect,
} from "@/lib/firebase-auth-errors";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";

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
  const db = getFirebaseFirestore();
  if (!db) {
    return;
  }

  try {
    await upsertUserAccount(db, user.uid, user.email ?? "", user.displayName ?? null);
  } catch (error) {
    console.error("Failed to record the user account:", error);
  }
}

export function useCoachAuth() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const authConfigured = useMemo(() => getFirebaseAuth() !== null, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
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

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        await recordAccount(user);
      }
    });

    return () => unsubscribe();
  }, []);

  async function signInWithGoogle() {
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthMessage("Google login is not configured yet.");
      return;
    }

    setAuthMessage("");
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
    const auth = getFirebaseAuth();
    if (!auth) {
      return;
    }

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