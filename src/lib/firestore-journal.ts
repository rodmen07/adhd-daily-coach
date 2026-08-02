// Value imports of `firebase/firestore` live INSIDE the async functions below
// (v0.19 PR3, D4): this module is statically imported by journal-store.ts,
// which /journal renders through, so a top-level value import here would drag
// the whole Firestore SDK back into the entry chunk. The type import is
// erased at compile time and costs nothing.
import type { Firestore } from "firebase/firestore";
import { JOURNAL_ENTRY_MAX_LENGTH, type JournalEntry } from "@/lib/journal";

/**
 * Firestore half of the gratitude journal store (v0.9). Pure client SDK
 * calls against `users/{uid}/journal/{entryId}`, mirroring the shape of
 * firestore-checkins.ts (v0.4): no server/API route, everything runs in the
 * browser against an already-provisioned BaaS.
 *
 * Unlike check-ins (append-only), the journal is one entry per calendar day,
 * edited in place. The date key IS the document id, so `setDoc` on
 * `users/{uid}/journal/{dateKey}` enforces the same one-per-day contract
 * `saveJournalEntry` (src/lib/journal.ts) enforces locally, and it holds
 * server-side too, independent of any client bug.
 */

async function journalDocRef(db: Firestore, scopeKey: string, dateKey: string) {
  const { doc } = await import("firebase/firestore");
  return doc(db, "users", scopeKey, "journal", dateKey);
}

/**
 * Upsert the single entry for a date. A second write for the same date edits
 * that entry in place (createdAt survives the read-before-write, updatedAt
 * refreshes) instead of creating a duplicate. Whitespace-only text is a
 * quiet no-op, matching saveJournalEntry, and returns null without touching
 * Firestore at all.
 */
export async function addFirestoreJournalEntry(
  db: Firestore,
  dateKey: string,
  text: string,
  scopeKey: string,
): Promise<JournalEntry | null> {
  const trimmed = text.trim().slice(0, JOURNAL_ENTRY_MAX_LENGTH);
  if (!trimmed) {
    return null;
  }

  const { getDoc, setDoc } = await import("firebase/firestore");
  const ref = await journalDocRef(db, scopeKey, dateKey);
  const existing = await getDoc(ref);
  const now = new Date().toISOString();
  const createdAt = existing.exists()
    ? (existing.data() as JournalEntry).createdAt
    : now;

  const entry: JournalEntry = {
    date: dateKey,
    text: trimmed,
    createdAt,
    updatedAt: now,
  };

  await setDoc(ref, entry);
  return entry;
}

/**
 * All entries for a scope, newest date first, matching listJournalEntries.
 * Mirrors firestore-checkins.ts's getFirestoreWeeklySummary: each document is
 * validated for its required fields before use, so a malformed or partially
 * written document (a failed write, a manual console edit, a future schema
 * migration mid-flight) is skipped instead of handed to the caller with
 * undefined date/text.
 */
export async function listFirestoreJournalEntries(
  db: Firestore,
  scopeKey: string,
): Promise<JournalEntry[]> {
  const { collection, getDocs, orderBy, query } = await import(
    "firebase/firestore"
  );

  const q = query(
    collection(db, "users", scopeKey, "journal"),
    orderBy("date", "desc"),
  );

  const snapshot = await getDocs(q);
  const entries: JournalEntry[] = [];

  for (const entrySnapshot of snapshot.docs) {
    const entry = entrySnapshot.data() as JournalEntry;
    if (!entry.date || !entry.text) {
      continue;
    }

    entries.push(entry);
  }

  return entries;
}
