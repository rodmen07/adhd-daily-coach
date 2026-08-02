/**
 * Check-in persistence store with backend selection.
 *
 * Backend resolution matrix (v0.4 "sync by default" flip):
 *
 * | NEXT_PUBLIC_CHECKIN_BACKEND | Firebase config | Signed in | Resolved backend |
 * |-----------------------------|-----------------|-----------|------------------|
 * | "local" (any case)          | any             | any       | local            |
 * | "firestore" (any case)      | any             | any       | firestore        |
 * | unset / empty / whitespace  | present         | yes       | firestore        |
 * | unset / empty / whitespace  | present         | no        | local            |
 * | unset / empty / whitespace  | absent          | any       | local            |
 * | any unrecognized value      | any             | any       | local            |
 *
 * Notes:
 * - "Signed in" is runtime state, so callers pass it via CheckinBackendContext
 *   (it defaults to false, which keeps server prerenders and signed-out visitors
 *   on local storage). "Firebase config" defaults to whether a Firestore client
 *   can be created from NEXT_PUBLIC_FIREBASE_* env vars.
 * - A resolved "firestore" backend still degrades safely: createCheckinStore
 *   returns the "firestore-fallback" adapter (pure local semantics) when the
 *   Firestore client is unavailable, and every Firestore write/read falls back
 *   to local storage on error, so a check-in is never lost. Under the automatic
 *   default, "firestore" is only chosen when Firebase config is present, so
 *   "firestore-fallback" can only arise from an explicit firestore setting.
 * - Rollback lever: set the repository variable NEXT_PUBLIC_CHECKIN_BACKEND to
 *   "local" (inlined by .github/workflows/deploy-pages.yml) to force local mode
 *   without a code change.
 */
import {
  addCheckin as addBrowserCheckin,
  getWeeklySummary as getBrowserWeeklySummary,
  listCheckins,
  listCheckinsInRange as listBrowserCheckinsInRange,
  type BrowserCheckin,
  type WeeklySummary,
} from "@/lib/browser-checkins";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import type { Firestore } from "firebase/firestore";
import {
  addFirestoreCheckin,
  getFirestoreCheckinsInRange,
  getFirestoreWeeklySummary,
} from "@/lib/firestore-checkins";
import {
  GUEST_SCOPE_KEY,
  guestMigrationMarker,
  migrateGuestRecords,
  type GuestMigrationPlan,
  type GuestMigrationResult,
} from "@/lib/guest-migration";

export type CheckinBackendMode = "local" | "firestore";

export type CheckinBackendContext = {
  /**
   * Whether Firebase client config is present (a Firestore client can be
   * created). Defaults to probing the Firebase env config.
   */
  firebaseConfigured?: boolean;
  /**
   * Whether a user is currently signed in. Auth state is async and only the
   * caller knows it, so it must be passed in; defaults to false (safe: local).
   */
  signedIn?: boolean;
};

export type CheckinInput = Omit<BrowserCheckin, "id" | "createdAt">;

export type CheckinStoreAdapter = {
  backend: CheckinBackendMode | "firestore-fallback";
  addCheckin: (input: CheckinInput, scopeKey: string) => Promise<void>;
  getWeeklySummary: (
    endDateInput: string | undefined,
    scopeKey: string,
  ) => Promise<WeeklySummary>;
  /**
   * Every check-in in a caller-chosen `days`-long window (v0.11 Trends). This
   * is the ONLY sanctioned way to read a wider check-in history: the review
   * page used to bypass this adapter and call browser-checkins.ts's
   * listCheckins directly, silently showing empty data for signed-in
   * Firestore-synced users (fixed in PR #106, with a regression test in
   * src/app/__tests__/review-page.test.tsx asserting listCheckins is never
   * called directly). Every caller of check-in history beyond the current
   * single-week summary must go through this method.
   */
  getCheckinsInRange: (
    days: number,
    endDateInput: string | undefined,
    scopeKey: string,
  ) => Promise<BrowserCheckin[]>;
  migrateGuestCheckins: (targetScopeKey: string) => Promise<GuestMigrationResult>;
};

/**
 * The check-in half of the shared v0.13 migration primitive.
 *
 * Note what is deliberately absent: no `conflictGuard`. The check-in log is
 * append-only (`addCheckin` mints a fresh id per write and several check-ins
 * can legitimately share a date), so there is no upsert for a guest record to
 * overwrite and no identity key that survives the write. The marker alone
 * prevents duplication, exactly as it has since v0.4. The journal opts in
 * instead, because its writes upsert by date and a naive copy really would
 * destroy account text (docs/design/GUEST_DATA_MIGRATION.md section 2).
 *
 * The marker key omits a collection segment on purpose - see
 * guestMigrationMarker - so people who already migrated stay migrated.
 */
function checkinMigrationPlan(
  backend: CheckinStoreAdapter["backend"],
  targetScopeKey: string,
  writeCheckin: (input: CheckinInput, scopeKey: string) => Promise<void>,
): GuestMigrationPlan<BrowserCheckin> {
  return {
    markerKey: guestMigrationMarker(targetScopeKey, backend),
    listGuestRecords: () => listCheckins(GUEST_SCOPE_KEY),
    write: (checkin) =>
      writeCheckin(
        {
          date: checkin.date,
          focus: checkin.focus,
          dose: checkin.dose,
          minutes: checkin.minutes,
          status: checkin.status,
          skipReason: checkin.skipReason,
        },
        targetScopeKey,
      ),
  };
}

export function resolveCheckinBackend(
  rawBackend = process.env.NEXT_PUBLIC_CHECKIN_BACKEND,
  context: CheckinBackendContext = {},
): CheckinBackendMode {
  const normalized = rawBackend?.trim().toLowerCase() ?? "";

  if (normalized === "firestore") {
    return "firestore";
  }

  if (normalized !== "") {
    // Explicit "local" and any unrecognized value force the safest mode.
    return "local";
  }

  // Unset: default to cloud sync only when it can actually work right now.
  // Config presence is the sync question; the SDK itself loads lazily inside
  // the adapter methods (v0.19 PR3, D4), so resolution stays synchronous.
  const firebaseConfigured = context.firebaseConfigured ?? isFirebaseConfigured();
  const signedIn = context.signedIn ?? false;

  return firebaseConfigured && signedIn ? "firestore" : "local";
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

export function createCheckinStore(
  rawBackend?: string,
  context: CheckinBackendContext = {},
): CheckinStoreAdapter {
  const configured = context.firebaseConfigured ?? isFirebaseConfigured();
  const backend = resolveCheckinBackend(rawBackend, {
    ...context,
    firebaseConfigured: configured,
  });

  const localStore: CheckinStoreAdapter = {
    backend: "local",
    addCheckin: async (input, scopeKey) => {
      addBrowserCheckin(input, scopeKey);
    },
    getWeeklySummary: async (endDateInput, scopeKey) => {
      return getBrowserWeeklySummary(endDateInput, scopeKey);
    },
    getCheckinsInRange: async (days, endDateInput, scopeKey) => {
      return listBrowserCheckinsInRange(days, endDateInput, scopeKey);
    },
    migrateGuestCheckins: async (targetScopeKey) => {
      return migrateGuestRecords(
        checkinMigrationPlan("local", targetScopeKey, async (input, scopeKey) => {
          addBrowserCheckin(input, scopeKey);
        }),
        targetScopeKey,
      );
    },
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
      addCheckin: async (input, scopeKey) => {
        try {
          const db = await requireFirestore();
          await addFirestoreCheckin(db, input, scopeKey);
        } catch {
          addBrowserCheckin(input, scopeKey);
        }
      },
      getWeeklySummary: async (endDateInput, scopeKey) => {
        try {
          const db = await requireFirestore();
          return await getFirestoreWeeklySummary(db, endDateInput, scopeKey);
        } catch {
          return getBrowserWeeklySummary(endDateInput, scopeKey);
        }
      },
      getCheckinsInRange: async (days, endDateInput, scopeKey) => {
        try {
          const db = await requireFirestore();
          return await getFirestoreCheckinsInRange(db, days, endDateInput, scopeKey);
        } catch {
          return listBrowserCheckinsInRange(days, endDateInput, scopeKey);
        }
      },
      migrateGuestCheckins: async (targetScopeKey) => {
        // An unloadable client delegates to the local migration, exactly as a
        // resolved-firestore adapter with no client behaved before the SDK
        // loaded lazily.
        const db = await loadFirebaseFirestore().catch(() => null);
        if (!db) {
          return localStore.migrateGuestCheckins(targetScopeKey);
        }

        // Deliberately unguarded: a thrown Firestore write must surface as
        // `error` so the local retry below runs, rather than being swallowed
        // into a silent local write under the firestore marker.
        const result = await migrateGuestRecords(
          checkinMigrationPlan("firestore", targetScopeKey, async (input, scopeKey) => {
            await addFirestoreCheckin(db, input, scopeKey);
          }),
          targetScopeKey,
        );

        if (result.status === "error") {
          return localStore.migrateGuestCheckins(targetScopeKey);
        }

        return result;
      },
    };
  }

  return localStore;
}