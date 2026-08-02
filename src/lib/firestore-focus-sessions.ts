// Value imports of `firebase/firestore` live INSIDE the async functions below
// (v0.19 PR3, D4): this module is statically imported by
// focus-session-store.ts, which /now renders through, so a top-level value
// import here would drag the whole Firestore SDK back into the entry chunk.
// The type import is erased at compile time and costs nothing.
import type { Firestore } from "firebase/firestore";
import {
  buildFocusSession,
  type FocusSession,
  type FocusSessionInput,
} from "@/lib/focus-session";

/**
 * Firestore half of the "one thing now" focus-session store (v0.12 PR2).
 * Pure client SDK calls against `users/{uid}/focusSessions/{sessionId}`,
 * mirroring firestore-checkins.ts (v0.4) and firestore-journal.ts (v0.9):
 * no server, no API route, everything runs in the browser against an
 * already-provisioned BaaS.
 *
 * Unlike the journal (one entry per day, edited in place) and like check-ins,
 * focus sessions are APPEND-ONLY: `/now` records a session when the person
 * closes it out and no client flow ever edits or deletes one, which is why
 * `docs/FIRESTORE_RULES.md` grants only read + create on this path. The
 * locally generated session id is the document id, so a retried write lands
 * on the same document instead of duplicating the session.
 *
 * The record shape comes from `buildFocusSession` in focus-session.ts, the
 * same stamper the local writer uses, so the two backends cannot drift.
 */

async function focusSessionDocRef(
  db: Firestore,
  scopeKey: string,
  sessionId: string,
) {
  const { doc } = await import("firebase/firestore");
  return doc(db, "users", scopeKey, "focusSessions", sessionId);
}

/**
 * Write an ALREADY-STAMPED session to its own document id (v0.13).
 *
 * The guest-to-account migration copies existing records, so it must preserve
 * the id, date, and createdAt it is copying rather than minting new ones. This
 * is also why that migration needs no conflict guard: `setDoc` on
 * `focusSessions/{session.id}` is idempotent, so re-running a copy rewrites
 * the same document instead of creating a second session. The local writer
 * `putFocusSession` deliberately has the same by-id semantics.
 *
 * Still a `create` against the documented ruleset for the case that actually
 * happens (the account has never held this id, because ids are minted
 * per-browser), so no rule change is required - see docs/FIRESTORE_RULES.md.
 */
export async function putFirestoreFocusSession(
  db: Firestore,
  session: FocusSession,
  scopeKey: string,
): Promise<FocusSession> {
  const { setDoc } = await import("firebase/firestore");
  await setDoc(await focusSessionDocRef(db, scopeKey, session.id), session);
  return session;
}

/**
 * Record a closed-out session for a signed-in person. Returns the stored
 * record so the caller can treat it exactly like `addFocusSession`'s return.
 */
export async function addFirestoreFocusSession(
  db: Firestore,
  input: FocusSessionInput,
  scopeKey: string,
): Promise<FocusSession> {
  return putFirestoreFocusSession(db, buildFocusSession(input), scopeKey);
}

/**
 * Every session for a scope, oldest first, matching the local
 * `listFocusSessions` append order so the two backends are interchangeable
 * for callers (`summarizeFocusSessions` filters by date and is order-
 * insensitive, but a future consumer that reads the list positionally should
 * not see a different order depending on who is signed in).
 *
 * Each document is validated before use, mirroring
 * `listFirestoreJournalEntries` and `getFirestoreWeeklySummary`: a malformed
 * or partially written document (a failed write, a manual console edit, a
 * future schema migration mid-flight) is skipped rather than handed to the
 * caller. `focusedSeconds` is checked for its TYPE, not just presence,
 * because `summarizeFocusSessions` sums it - a string or missing value there
 * would silently turn the whole week's minutes into NaN.
 */
export async function listFirestoreFocusSessions(
  db: Firestore,
  scopeKey: string,
): Promise<FocusSession[]> {
  const { collection, getDocs, orderBy, query } = await import(
    "firebase/firestore"
  );

  const q = query(
    collection(db, "users", scopeKey, "focusSessions"),
    orderBy("createdAt", "asc"),
  );

  const snapshot = await getDocs(q);
  const sessions: FocusSession[] = [];

  for (const sessionSnapshot of snapshot.docs) {
    const session = sessionSnapshot.data() as FocusSession;
    if (
      !session.id ||
      !session.date ||
      !session.outcome ||
      typeof session.focusedSeconds !== "number" ||
      Number.isNaN(session.focusedSeconds)
    ) {
      continue;
    }

    sessions.push(session);
  }

  return sessions;
}
