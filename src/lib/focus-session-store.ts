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
 * Explicitly out of scope for v0.12, matching v0.9: migrating existing guest
 * localStorage sessions into a signed-in scope (tracked as a named follow-up,
 * not silently dropped).
 */
import {
  resolveCheckinBackend,
  type CheckinBackendContext,
  type CheckinBackendMode,
} from "@/lib/checkin-store";
import {
  addFocusSession as addLocalFocusSession,
  listFocusSessions as listLocalFocusSessions,
  type FocusSession,
  type FocusSessionInput,
} from "@/lib/focus-session";
import { getFirebaseFirestore } from "@/lib/firebase";
import {
  addFirestoreFocusSession,
  listFirestoreFocusSessions,
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
};

export function createFocusSessionStore(
  rawBackend?: string,
  context: FocusSessionBackendContext = {},
): FocusSessionStoreAdapter {
  const db = getFirebaseFirestore();
  const backend = resolveCheckinBackend(rawBackend, {
    ...context,
    firebaseConfigured: context.firebaseConfigured ?? db !== null,
  });

  const localStore: FocusSessionStoreAdapter = {
    backend: "local",
    listFocusSessions: async (scopeKey) => listLocalFocusSessions(scopeKey),
    addFocusSession: async (input, scopeKey) =>
      addLocalFocusSession(input, scopeKey),
  };

  if (backend === "firestore") {
    if (!db) {
      return {
        ...localStore,
        backend: "firestore-fallback",
      };
    }

    return {
      backend: "firestore",
      listFocusSessions: async (scopeKey) => {
        try {
          return await listFirestoreFocusSessions(db, scopeKey);
        } catch {
          return listLocalFocusSessions(scopeKey);
        }
      },
      addFocusSession: async (input, scopeKey) => {
        try {
          return await addFirestoreFocusSession(db, input, scopeKey);
        } catch {
          return addLocalFocusSession(input, scopeKey);
        }
      },
    };
  }

  return localStore;
}
