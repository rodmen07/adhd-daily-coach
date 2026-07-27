/**
 * Collection-agnostic guest-to-account migration (v0.13).
 *
 * Extracted verbatim from the copy loop check-ins have carried since v0.4
 * (`checkin-store.ts`), so that the journal and focus sessions can bring a
 * signed-out person's records with them on sign-in without each store
 * growing its own subtly different version of the same loop. See
 * docs/design/GUEST_DATA_MIGRATION.md for the full plan and its overridable
 * defaults.
 *
 * The contract, unchanged from the check-in original:
 *
 * - `skipped`          nothing to do: no window, no real target scope, or the
 *                      guest scope holds no records. The marker is still set
 *                      in the empty-records case, so a person who never used
 *                      the app signed out never pays for a re-check.
 * - `already-migrated` the marker for this (scope, backend, collection) is
 *                      already set; zero reads, zero writes.
 * - `migrated`         the copy ran to completion. `migratedCount` is the
 *                      number of records actually written, which can legally
 *                      be 0 when the conflict guard skipped every record.
 * - `error`            a write threw. The marker is deliberately NOT set, so
 *                      the next load retries; already-written records are
 *                      protected from duplication by the conflict guard when
 *                      the collection has one.
 *
 * Two safety properties this module is responsible for:
 *
 * 1. **The guest copy is never deleted** (D4). Migration copies; the caller
 *    is given no hook that could remove the source, so a failure part-way
 *    through can never lose data.
 * 2. **Account data wins** (D3), for collections that opt into the conflict
 *    guard. This is not decoration: `saveJournalEntry` upserts by date, so a
 *    guest entry written on a date the account already has would otherwise
 *    silently overwrite the account's text. Append-only collections (the
 *    check-in log) deliberately pass no guard - see `checkin-store.ts`.
 */

export type GuestMigrationStatus =
  | "migrated"
  | "already-migrated"
  | "skipped"
  | "error";

export type GuestMigrationResult = {
  status: GuestMigrationStatus;
  migratedCount: number;
};

/**
 * Records written while signed out always live in local storage under this
 * scope: a signed-out person has no cloud scope to read from.
 */
export const GUEST_SCOPE_KEY = "guest";

const MIGRATION_MARKER_PREFIX = "calm-daily-coach-migrated-guest";

/**
 * Idempotency marker key for one (scope, backend, collection) triple (D2).
 *
 * `collection` is optional purely for backward compatibility: check-ins have
 * been writing `<prefix>:<scope>:<backend>` since v0.4, and appending a
 * `:checkins` segment now would make every already-migrated person look
 * un-migrated and re-run their copy. New collections pass their own segment,
 * which is what keeps one collection's migration from ever marking another
 * as done.
 */
export function guestMigrationMarker(
  targetScopeKey: string,
  backend: string,
  collection?: string,
): string {
  const base = `${MIGRATION_MARKER_PREFIX}:${targetScopeKey}:${backend}`;
  return collection ? `${base}:${collection}` : base;
}

export type GuestMigrationConflictGuard<T> = {
  /** The account's existing records, read once before any write. */
  listAccountRecords: () => Promise<T[]>;
  /**
   * The value that makes two records "the same record" (a date key for the
   * journal, since that is what its upsert collides on).
   */
  identityKey: (record: T) => string;
};

export type GuestMigrationPlan<T> = {
  /** Full local-storage key from `guestMigrationMarker`. */
  markerKey: string;
  /** Guest-scoped records to copy. Always a local read. */
  listGuestRecords: () => T[];
  /**
   * Omit for append-only collections, where re-copying can only duplicate
   * (and the marker already prevents that) rather than overwrite.
   */
  conflictGuard?: GuestMigrationConflictGuard<T>;
  /** Write one record into the account scope. May throw; see `error` above. */
  write: (record: T) => Promise<void>;
};

export async function migrateGuestRecords<T>(
  plan: GuestMigrationPlan<T>,
  targetScopeKey: string,
): Promise<GuestMigrationResult> {
  if (typeof window === "undefined") {
    return { status: "skipped", migratedCount: 0 };
  }

  if (!targetScopeKey || targetScopeKey === GUEST_SCOPE_KEY) {
    return { status: "skipped", migratedCount: 0 };
  }

  if (window.localStorage.getItem(plan.markerKey) === "1") {
    return { status: "already-migrated", migratedCount: 0 };
  }

  const guestRecords = plan.listGuestRecords();
  if (guestRecords.length === 0) {
    window.localStorage.setItem(plan.markerKey, "1");
    return { status: "skipped", migratedCount: 0 };
  }

  let migratedCount = 0;

  try {
    const guard = plan.conflictGuard;
    // Read the account's keys once, not per record: the Firestore branches
    // pay a network round trip for this.
    const takenKeys = guard
      ? new Set((await guard.listAccountRecords()).map(guard.identityKey))
      : null;

    for (const record of guestRecords) {
      if (guard && takenKeys) {
        const key = guard.identityKey(record);
        if (takenKeys.has(key)) {
          continue;
        }
        // Two guest records sharing an identity key would collide with each
        // other exactly the way they collide with the account: first wins.
        takenKeys.add(key);
      }

      await plan.write(record);
      migratedCount += 1;
    }

    window.localStorage.setItem(plan.markerKey, "1");
    return { status: "migrated", migratedCount };
  } catch {
    return { status: "error", migratedCount };
  }
}

export type GuestSingleRecordMigrationPlan<T> = {
  /** Full local-storage key from `guestMigrationMarker`. */
  markerKey: string;
  /**
   * The guest-scoped record to copy, or `null` when the guest scope holds
   * none worth carrying. Always a local read.
   */
  readGuestRecord: () => T | null;
  /**
   * True when the account scope already holds a live record of its own, in
   * which case the account's record wins (D3) and nothing is written. This is
   * the single-record form of the conflict guard: with only one record there
   * is no identity key to compare, just presence.
   */
  hasAccountRecord: () => Promise<boolean>;
  /** Write the record into the account scope. May throw; see `error` above. */
  write: (record: T) => Promise<void>;
};

/**
 * Single-record sibling of `migrateGuestRecords` (v0.17, D2 of
 * docs/design/GUEST_WORKSPACE_MIGRATION.md), for stores that keep ONE blob
 * per scope (planner state) rather than a listable collection. Forcing a
 * blob through the list shape would mean wrapping it in a one-element array
 * purely to satisfy the plan type, so the two paths share the contract and
 * the vocabulary instead: same four `GuestMigrationResult` states, same
 * marker rule, same marker-unset-on-error retry, same never-delete-the-guest
 * -copy safety property. `migratedCount` is 0 or 1; like the list form's
 * guard-skipped-everything case, a run where the account's own record won
 * still returns `migrated` with a count of 0, because the migration is done
 * for this (scope, backend, collection) triple and must not re-run.
 */
export async function migrateGuestSingleRecord<T>(
  plan: GuestSingleRecordMigrationPlan<T>,
  targetScopeKey: string,
): Promise<GuestMigrationResult> {
  if (typeof window === "undefined") {
    return { status: "skipped", migratedCount: 0 };
  }

  if (!targetScopeKey || targetScopeKey === GUEST_SCOPE_KEY) {
    return { status: "skipped", migratedCount: 0 };
  }

  if (window.localStorage.getItem(plan.markerKey) === "1") {
    return { status: "already-migrated", migratedCount: 0 };
  }

  const guestRecord = plan.readGuestRecord();
  if (guestRecord === null) {
    window.localStorage.setItem(plan.markerKey, "1");
    return { status: "skipped", migratedCount: 0 };
  }

  try {
    if (await plan.hasAccountRecord()) {
      window.localStorage.setItem(plan.markerKey, "1");
      return { status: "migrated", migratedCount: 0 };
    }

    await plan.write(guestRecord);
    window.localStorage.setItem(plan.markerKey, "1");
    return { status: "migrated", migratedCount: 1 };
  } catch {
    return { status: "error", migratedCount: 0 };
  }
}
