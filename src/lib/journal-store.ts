/**
 * Journal persistence store with backend selection (v0.9).
 *
 * Reuses the check-in backend's resolution policy wholesale: same
 * NEXT_PUBLIC_CHECKIN_BACKEND repo variable, same "Firebase configured AND
 * signed in => firestore" default (see resolveCheckinBackend in
 * checkin-store.ts for the full matrix). There is no
 * NEXT_PUBLIC_JOURNAL_BACKEND variable and none is planned: one resolution
 * policy is one less config surface to keep consistent, and there is no
 * product reason for check-ins and journal entries to sync on different
 * conditions. If that ever changes, this is the one place to add a
 * journal-specific override.
 *
 * Safety property (mirrors check-ins): a resolved "firestore" backend still
 * degrades safely. createJournalStore returns the "firestore-fallback"
 * adapter (pure local semantics) when the Firestore client is unavailable,
 * and every Firestore write/read falls back to local storage on error, so a
 * journal entry is never lost.
 *
 * Guest-to-account migration (v0.13) closes the gap v0.9 named and left open:
 * entries written while signed out used to stay stranded in the guest scope,
 * so signing in showed an empty journal. `migrateGuestJournalEntries` copies
 * them on first signed-in load. Unlike check-ins, the journal opts into the
 * primitive's conflict guard - `saveJournalEntry` upserts by date, so a guest
 * entry sharing a date with an account entry would otherwise overwrite the
 * account's text. Account data wins; the guest copy is left untouched.
 */
import {
  resolveCheckinBackend,
  type CheckinBackendContext,
  type CheckinBackendMode,
} from "@/lib/checkin-store";
import {
  GUEST_SCOPE_KEY,
  guestMigrationMarker,
  migrateGuestRecords,
  type GuestMigrationPlan,
  type GuestMigrationResult,
} from "@/lib/guest-migration";
import {
  listJournalEntries as listLocalJournalEntries,
  saveJournalEntry as saveLocalJournalEntry,
  type JournalEntry,
} from "@/lib/journal";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";
import {
  addFirestoreJournalEntry,
  listFirestoreJournalEntries,
} from "@/lib/firestore-journal";

export type JournalBackendContext = CheckinBackendContext;
export type JournalBackendMode = CheckinBackendMode;

export type JournalStoreAdapter = {
  backend: JournalBackendMode | "firestore-fallback";
  listJournalEntries: (scopeKey: string) => Promise<JournalEntry[]>;
  saveJournalEntry: (
    dateKey: string,
    text: string,
    scopeKey: string,
  ) => Promise<JournalEntry | null>;
  /**
   * Copy guest-scoped entries into the signed-in scope, once (v0.13). Safe to
   * call on every load: the guest scope, an empty guest journal, and an
   * already-migrated marker all return without writing.
   */
  migrateGuestJournalEntries: (
    targetScopeKey: string,
  ) => Promise<GuestMigrationResult>;
};

type JournalMigrationIO = {
  listAccountEntries: (scopeKey: string) => Promise<JournalEntry[]>;
  saveEntry: (entry: JournalEntry, scopeKey: string) => Promise<void>;
};

function journalMigrationPlan(
  backend: JournalStoreAdapter["backend"],
  targetScopeKey: string,
  io: JournalMigrationIO,
): GuestMigrationPlan<JournalEntry> {
  return {
    markerKey: guestMigrationMarker(targetScopeKey, backend, "journal"),
    listGuestRecords: () => listLocalJournalEntries(GUEST_SCOPE_KEY),
    conflictGuard: {
      listAccountRecords: () => io.listAccountEntries(targetScopeKey),
      // The date key is exactly what saveJournalEntry upserts on, so it is
      // also exactly what an overwrite would collide on.
      identityKey: (entry) => entry.date,
    },
    write: (entry) => io.saveEntry(entry, targetScopeKey),
  };
}

/**
 * The Firestore client for a firestore-resolved adapter method (v0.19 PR3).
 * Throws when the client cannot be produced - config vanished or the SDK
 * chunk failed to load - so the caller's existing try/catch falls back to
 * local storage exactly as it does for a failed Firestore call.
 */
async function requireFirestore(): Promise<Firestore> {
  const db = await loadFirebaseFirestore();
  if (!db) {
    throw new Error("Firestore client unavailable");
  }
  return db;
}

export function createJournalStore(
  rawBackend?: string,
  context: JournalBackendContext = {},
): JournalStoreAdapter {
  const configured = context.firebaseConfigured ?? isFirebaseConfigured();
  const backend = resolveCheckinBackend(rawBackend, {
    ...context,
    firebaseConfigured: configured,
  });

  const localStore: JournalStoreAdapter = {
    backend: "local",
    listJournalEntries: async (scopeKey) => listLocalJournalEntries(scopeKey),
    saveJournalEntry: async (dateKey, text, scopeKey) =>
      saveLocalJournalEntry(dateKey, text, scopeKey),
    migrateGuestJournalEntries: async (targetScopeKey) =>
      migrateGuestRecords(
        journalMigrationPlan("local", targetScopeKey, {
          listAccountEntries: async (scopeKey) => listLocalJournalEntries(scopeKey),
          saveEntry: async (entry, scopeKey) => {
            saveLocalJournalEntry(entry.date, entry.text, scopeKey);
          },
        }),
        targetScopeKey,
      ),
  };

  if (backend === "firestore") {
    if (!configured) {
      return {
        ...localStore,
        backend: "firestore-fallback",
      };
    }

    return {
      backend: "firestore",
      listJournalEntries: async (scopeKey) => {
        try {
          const db = await requireFirestore();
          return await listFirestoreJournalEntries(db, scopeKey);
        } catch {
          return listLocalJournalEntries(scopeKey);
        }
      },
      saveJournalEntry: async (dateKey, text, scopeKey) => {
        try {
          const db = await requireFirestore();
          return await addFirestoreJournalEntry(db, dateKey, text, scopeKey);
        } catch {
          return saveLocalJournalEntry(dateKey, text, scopeKey);
        }
      },
      migrateGuestJournalEntries: async (targetScopeKey) => {
        // An unloadable client delegates to the local migration, exactly as a
        // resolved-firestore adapter with no client behaved before the SDK
        // loaded lazily.
        const db = await loadFirebaseFirestore().catch(() => null);
        if (!db) {
          return localStore.migrateGuestJournalEntries(targetScopeKey);
        }

        // Deliberately unguarded, mirroring migrateGuestCheckins: a thrown
        // Firestore read or write must surface as `error` so the local retry
        // runs, rather than being swallowed per record.
        const result = await migrateGuestRecords(
          journalMigrationPlan("firestore", targetScopeKey, {
            listAccountEntries: (scopeKey) =>
              listFirestoreJournalEntries(db, scopeKey),
            saveEntry: async (entry, scopeKey) => {
              await addFirestoreJournalEntry(db, entry.date, entry.text, scopeKey);
            },
          }),
          targetScopeKey,
        );

        if (result.status === "error") {
          return localStore.migrateGuestJournalEntries(targetScopeKey);
        }

        return result;
      },
    };
  }

  return localStore;
}
