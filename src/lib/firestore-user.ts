// Value imports of `firebase/firestore` live INSIDE the async functions below
// (v0.19 PR3, D4): this module is statically imported by use-coach-auth.ts and
// subscription-guard.tsx, which every route renders, so a top-level value
// import here would drag the whole Firestore SDK back into the entry chunk.
// The type import is erased at compile time and costs nothing.
import type { Firestore } from "firebase/firestore";

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string | null;
  createdAt: string; // ISO string format for safe static JSON serialization
  subscriptionStatus: "free_trial" | "active" | "expired";
}

/**
 * Cleanly upserts standard user details in Firestore.
 */
export async function upsertUserAccount(
  db: Firestore,
  uid: string,
  email: string,
  displayName: string | null
): Promise<UserAccount> {
  const { doc, getDoc, setDoc } = await import("firebase/firestore");
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const existing = userSnap.data();
    const updated = {
      ...existing,
      email,
      displayName,
    };
    await setDoc(userRef, updated, { merge: true });
    return {
      uid,
      email,
      displayName,
      createdAt: existing.createdAt || new Date().toISOString(),
      subscriptionStatus: existing.subscriptionStatus || "free_trial",
    };
  } else {
    const newUser: UserAccount = {
      uid,
      email,
      displayName,
      createdAt: new Date().toISOString(),
      subscriptionStatus: "free_trial",
    };
    await setDoc(userRef, newUser);
    return newUser;
  }
}

/**
 * Returns user account data from Firestore.
 */
export async function getUserAccount(db: Firestore, uid: string): Promise<UserAccount | null> {
  const { doc, getDoc } = await import("firebase/firestore");
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as UserAccount;
  }
  return null;
}

/**
 * Calculates remaining days in the 30-day free trial, clamped at 0.
 *
 * Returns **NaN for a date this cannot read**, and that is deliberate. The
 * arithmetic below cannot throw - `new Date("nope")` is an Invalid Date rather
 * than an error, and `.getTime()` on it yields NaN, which propagates through
 * `Math.max` - so the `catch { return 0 }` this function used to carry was
 * unreachable code documenting a contract it never delivered (the file's only
 * uncovered lines, which is how it was found). Returning 0 would mean "trial
 * finished", so the tidier-looking fix would silently start locking out every
 * account with a corrupt `createdAt`; the docstring was corrected to match the
 * behavior instead (decision D6 in docs/design/GUEST_ACCESS_AND_PAYWALL.md).
 *
 * Callers must therefore not render this number without checking it, and must
 * not read a comparison against it as an answer: NaN answers "no" to `> 0` and
 * to `<= 0` alike. `resolveEntitlement` in `@/lib/entitlement` is where that
 * check lives for the whole app - it maps a non-finite result to an `unknown`
 * entitlement that neither blocks anyone nor prints a day count.
 */
export function getTrialDaysRemaining(createdAtIsoStr: string): number {
  const createdDate = new Date(createdAtIsoStr);
  const now = new Date();
  const diffTime = now.getTime() - createdDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - diffDays);
}
