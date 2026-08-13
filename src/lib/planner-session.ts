import type { AsyncStatus } from "@/lib/async-status";
import type { WeeklySummary } from "@/lib/browser-checkins";
import type { CheckinStoreAdapter } from "@/lib/checkin-store";
import { migrationNotice, type MigrationCopy } from "@/lib/migration-notice";
import {
  getInitialPlannerState,
  migrateGuestPlannerState,
  type SavedPlannerState,
} from "@/lib/planner-state";

/**
 * The sentences `/` says about the two migrations it awaits (v0.30,
 * docs/design/MIGRATION_VOICE.md D2).
 *
 * Lifted out of the function body in one named record, in the
 * `focus-session-copy.ts` style: this was the one of the three speaking
 * surfaces that inlined its strings, so the copy could not be read, tested, or
 * tone-checked without stepping through the hydration logic around it.
 */
export const PLANNER_SESSION_COPY = {
  // v0.28 (docs/design/MIGRATION_DESTINATION.md D3): the copy completed, but a
  // firestore-resolved store fell back to its local twin, so the records are in
  // this browser and not in the account the ok sentence would have claimed. No
  // count and no instruction: there is nothing for the person to do, and the
  // cloud copy retries itself on the next load because only the local marker
  // was written (D6, pinned by the retry test in checkin-store.test.ts).
  checkinMigrationLocalNote:
    "Your earlier check-ins are safe in this browser. They will be copied to your account next time it can be reached.",
  checkinMigrationErrorNote: "Could not migrate guest check-ins to your account.",
  plannerMigrationNote: "Brought today's plan along to your account.",
  plannerMigrationErrorNote: "Could not migrate today's guest plan to your account.",
} as const;

/**
 * The one migration sentence in this module that is not a constant.
 *
 * A function rather than a record field for the same reason `focusWeekRecap`
 * is one: the sentence names a count, so it has to be built, and building it
 * here keeps the whole user-facing surface inside the module a tone check can
 * read rather than assembled from fragments at the call site.
 */
export function checkinMigrationNote(migratedCount: number): string {
  return `Migrated ${migratedCount} guest check-in${migratedCount === 1 ? "" : "s"} to your account.`;
}

/**
 * The planner state has NO cloud twin, so it has no `local` sentence.
 *
 * `migrateGuestPlannerState` never calls `guestMigrationLandedLocally` - the
 * only minter of `migrated-locally`, whose nine call sites are all in
 * `checkin-store.ts`, `focus-session-store.ts` and `journal-store.ts` - so that
 * outcome is unproducible here, and a "will be copied to your account" line
 * would promise a cloud this store does not have
 * (MIGRATION_VOICE.md D3, MIGRATION_DESTINATION.md D2).
 */
const PLANNER_STATE_MIGRATION_COPY: MigrationCopy = {
  ok: PLANNER_SESSION_COPY.plannerMigrationNote,
  error: PLANNER_SESSION_COPY.plannerMigrationErrorNote,
};

export type HydratePlannerSessionInput = {
  initialState: SavedPlannerState;
  authEmail?: string | null;
  storageScope: string;
  checkinStore: Pick<CheckinStoreAdapter, "migrateGuestCheckins" | "getWeeklySummary">;
};

export type HydratePlannerSessionResult = {
  nextState: SavedPlannerState;
  migrationStatus: AsyncStatus;
  weeklySummary: WeeklySummary | null;
};

export async function hydratePlannerSession({
  initialState,
  authEmail,
  storageScope,
  checkinStore,
}: HydratePlannerSessionInput): Promise<HydratePlannerSessionResult> {
  let migrationStatus: AsyncStatus = { type: "idle" };
  let hydratedState = initialState;

  if (storageScope !== "guest") {
    const migration = await checkinStore.migrateGuestCheckins(storageScope);

    // v0.30 (MIGRATION_VOICE.md D1): one seam, three sentences. The check-in
    // store DOES have a Firestore twin, so this record carries a `local` line
    // where the planner state's below does not. `migrationStatus` was
    // initialised to `idle` immediately above and nothing else has written it
    // yet, so assigning the seam's `idle` for a quiet outcome is the same
    // no-op the three-branch `if` this replaces performed by falling through.
    migrationStatus = migrationNotice(migration, {
      ok: checkinMigrationNote(migration.migratedCount),
      local: PLANNER_SESSION_COPY.checkinMigrationLocalNote,
      error: PLANNER_SESSION_COPY.checkinMigrationErrorNote,
    });

    // v0.17 PR2: live same-day guest planner state crosses sign-in, so the
    // dashboard ring does not reset at the moment of conversion. `initialState`
    // was read from the account scope BEFORE the copy landed, so a real copy
    // re-reads the scope here; the ring downstream then sees the migrated
    // `checkedIn` in this same load, not after a manual refresh. A quiet
    // outcome (skipped / already-migrated / account's own state won) changes
    // nothing. On error the retry rule is the marker's, not ours; it only has
    // to be heard (one calm line, the same surface check-ins already use),
    // though a check-in error keeps the line, being the bigger loss.
    const plannerMigration = await migrateGuestPlannerState(storageScope);

    const plannerNotice = migrationNotice(plannerMigration, PLANNER_STATE_MIGRATION_COPY);

    if (plannerMigration.status === "migrated" && plannerMigration.migratedCount > 0) {
      hydratedState = getInitialPlannerState(storageScope);
    }

    // The precedence between the two migrations is unchanged and stays here
    // rather than moving into the seam: a check-in message outranks the
    // planner's ok line, and a check-in error is never downgraded, because a
    // check-in loss is the bigger one. `plannerNotice` is `ok` exactly when the
    // old first branch matched and `error` exactly when the old second one did,
    // and the two are mutually exclusive, so the split `if` below decides the
    // same way the old `else if` chain did.
    if (plannerNotice.type === "ok" && migrationStatus.type === "idle") {
      migrationStatus = plannerNotice;
    } else if (plannerNotice.type === "error" && migrationStatus.type !== "error") {
      migrationStatus = plannerNotice;
    }
  }

  let weeklySummary: WeeklySummary | null = null;
  try {
    weeklySummary = await checkinStore.getWeeklySummary(undefined, storageScope);
  } catch {
    weeklySummary = null;
  }

  return {
    nextState: {
      ...hydratedState,
      email: hydratedState.email || authEmail || "",
    },
    migrationStatus,
    weeklySummary,
  };
}
