import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from "firebase/firestore";
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

function focusSessionDocRef(db: Firestore, scopeKey: string, sessionId: string) {
  return doc(db, "users", scopeKey, "focusSessions", sessionId);
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
  const session = buildFocusSession(input);
  await setDoc(focusSessionDocRef(db, scopeKey, session.id), session);
  return session;
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
