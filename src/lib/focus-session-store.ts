/**
 * Focus-session persistence store with backend selection (v0.12 PR2).
 *
 * Reuses the check-in backend's resolution policy wholesale, exactly as
 * journal-store.ts (v0.9) does: same NEXT_PUBLIC_CHECKIN_BACKEND repo
 * variable, same "Firebase configured AND signed in => firestore" default
 * (see resolveCheckinBackend in checkin-store.ts for the full matrix). There
 * is no NEXT_PUBLIC_FOCUS_BACKEND variable and none is planned - one
 * resolution policy is one less config surface to keep consistent, and there
 * is no product reason for check-ins, journal entries, and focus sessions to
 * sync on different conditions (docs/design/FOCUS_IN_TRENDS.md section 6
 * lists a dedicated toggle as the override if that ever changes).
 *
 * Safety property (mirrors check-ins and the journal): a resolved "firestore"
 * backend still degrades safely. createFocusSessionStore returns the
 * "firestore-fallback" adapter (pure local semantics) when the Firestore
 * client is unavailable, and every Firestore write/read falls back to local
 * storage on error, so a recorded session is never lost - which matters more
 * here than anywhere else in the app, because the product rule is that a
 * session the person chose to close out is the only thing ever recorded.
 * Guest-to-account migration (v0.13) closes the gap v0.12 named and left open:
 * sessions recorded while signed out used to stay stranded in the guest scope,
 * so signing in zeroed the /trends focus card and /now's tally while the real
 * sessions sat intact in local storage. `migrateGuestFocusSessions` copies
 * them on first signed-in load.
 *
 * Unlike the journal, this collection does NOT opt into the primitive's
 * conflict guard, and that is a decision rather than an omission. The guard
 * exists to stop an upsert from overwriting account data on a shared identity
 * key; focus sessions have no upsert to protect. Every write goes to the
 * session's OWN id (`putFocusSession` locally, `setDoc` on
 * `focusSessions/{id}` in Firestore), ids are minted per browser, and a
 * repeated copy therefore rewrites the identical record rather than
 * duplicating or clobbering anything. Paying for an extra account-wide read on
 * every sign-in to guard against a collision that cannot happen would be cost
 * without safety.
 */
import {
  resolveCheckinBackend,
  type CheckinBackendContext,
  type CheckinBackendMode,
} from "@/lib/checkin-store";
import {
  GUEST_SCOPE_KEY,
  guestMigrationLandedLocally,
  guestMigrationMarker,
  migrateGuestRecords,
  type GuestMigrationPlan,
  type GuestMigrationResult,
} from "@/lib/guest-migration";
import {
  addFocusSession as addLocalFocusSession,
  listFocusSessions as listLocalFocusSessions,
  putFocusSession as putLocalFocusSession,
  type FocusSession,
  type FocusSessionInput,
} from "@/lib/focus-session";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";
import {
  addFirestoreFocusSession,
  listFirestoreFocusSessions,
  putFirestoreFocusSession,
} from "@/lib/firestore-focus-sessions";

export type FocusSessionBackendContext = CheckinBackendContext;
export type FocusSessionBackendMode = CheckinBackendMode;

export type FocusSessionStoreAdapter = {
  backend: FocusSessionBackendMode | "firestore-fallback";
  listFocusSessions: (scopeKey: string) => Promise<FocusSession[]>;
  addFocusSession: (
    input: FocusSessionInput,
    scopeKey: string,
  ) => Promise<FocusSession>;
  /**
   * Copy guest-scoped sessions into the signed-in scope, once (v0.13). Safe to
   * call on every load: the guest scope, an empty guest history, and an
   * already-migrated marker all return without writing.
   */
  migrateGuestFocusSessions: (
    targetScopeKey: string,
  ) => Promise<GuestMigrationResult>;
};

type FocusSessionMigrationIO = {
  writeSession: (session: FocusSession, scopeKey: string) => Promise<void>;
};

function focusSessionMigrationPlan(
  backend: FocusSessionStoreAdapter["backend"],
  targetScopeKey: string,
  io: FocusSessionMigrationIO,
): GuestMigrationPlan<FocusSession> {
  return {
    markerKey: guestMigrationMarker(targetScopeKey, backend, "focusSessions"),
    listGuestRecords: () => listLocalFocusSessions(GUEST_SCOPE_KEY),
    // No conflictGuard, deliberately: see the module doc above. Both writers
    // key on the session's own id, so a re-copy is idempotent by construction
    // and there is no upsert for an account record to lose.
    write: (session) => io.writeSession(session, targetScopeKey),
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

export function createFocusSessionStore(
  rawBackend?: string,
  context: FocusSessionBackendContext = {},
): FocusSessionStoreAdapter {
  const configured = context.firebaseConfigured ?? isFirebaseConfigured();
  const backend = resolveCheckinBackend(rawBackend, {
    ...context,
    firebaseConfigured: configured,
  });

  const localStore: FocusSessionStoreAdapter = {
    backend: "local",
    listFocusSessions: async (scopeKey) => listLocalFocusSessions(scopeKey),
    addFocusSession: async (input, scopeKey) =>
      addLocalFocusSession(input, scopeKey),
    migrateGuestFocusSessions: async (targetScopeKey) =>
      migrateGuestRecords(
        focusSessionMigrationPlan("local", targetScopeKey, {
          writeSession: async (session, scopeKey) => {
            putLocalFocusSession(session, scopeKey);
          },
        }),
        targetScopeKey,
      ),
  };

  if (backend === "firestore") {
    if (!configured) {
      // v0.28 D2, mirroring checkin-store and journal-store: firestore-RESOLVED
      // with local semantics, so a completed copy landed in the browser.
      return {
        ...localStore,
        backend: "firestore-fallback",
        migrateGuestFocusSessions: async (targetScopeKey) =>
          guestMigrationLandedLocally(
            await localStore.migrateGuestFocusSessions(targetScopeKey),
          ),
      };
    }

    return {
      backend: "firestore",
      listFocusSessions: async (scopeKey) => {
        try {
          const db = await requireFirestore();
          return await listFirestoreFocusSessions(db, scopeKey);
        } catch {
          return listLocalFocusSessions(scopeKey);
        }
      },
      addFocusSession: async (input, scopeKey) => {
        try {
          const db = await requireFirestore();
          return await addFirestoreFocusSession(db, input, scopeKey);
        } catch {
          return addLocalFocusSession(input, scopeKey);
        }
      },
      migrateGuestFocusSessions: async (targetScopeKey) => {
        // An unloadable client delegates to the local migration, exactly as a
        // resolved-firestore adapter with no client behaved before the SDK
        // loaded lazily.
        const db = await loadFirebaseFirestore().catch(() => null);
        if (!db) {
          return guestMigrationLandedLocally(
            await localStore.migrateGuestFocusSessions(targetScopeKey),
          );
        }

        // Deliberately unguarded, mirroring migrateGuestCheckins and
        // migrateGuestJournalEntries: a thrown Firestore write must surface as
        // `error` so the local retry below runs, rather than being swallowed
        // per record and leaving half a history behind.
        const result = await migrateGuestRecords(
          focusSessionMigrationPlan("firestore", targetScopeKey, {
            writeSession: async (session, scopeKey) => {
              await putFirestoreFocusSession(db, session, scopeKey);
            },
          }),
          targetScopeKey,
        );

        if (result.status === "error") {
          // v0.28 D2: the local retry succeeds, but in this browser - see the
          // note in checkin-store.
          return guestMigrationLandedLocally(
            await localStore.migrateGuestFocusSessions(targetScopeKey),
          );
        }

        return result;
      },
    };
  }

  return localStore;
}
