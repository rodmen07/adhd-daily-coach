import type { AsyncStatus } from "@/lib/async-status";
import type { WeeklySummary } from "@/lib/browser-checkins";
import type { CheckinStoreAdapter } from "@/lib/checkin-store";
import {
  getInitialPlannerState,
  migrateGuestPlannerState,
  type SavedPlannerState,
} from "@/lib/planner-state";

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

    if (migration.status === "migrated" && migration.migratedCount > 0) {
      migrationStatus = {
        type: "ok",
        message: `Migrated ${migration.migratedCount} guest check-in${migration.migratedCount === 1 ? "" : "s"} to your account.`,
      };
    } else if (migration.status === "error") {
      migrationStatus = {
        type: "error",
        message: "Could not migrate guest check-ins to your account.",
      };
    }

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

    if (plannerMigration.status === "migrated" && plannerMigration.migratedCount > 0) {
      hydratedState = getInitialPlannerState(storageScope);
      if (migrationStatus.type === "idle") {
        migrationStatus = {
          type: "ok",
          message: "Brought today's plan along to your account.",
        };
      }
    } else if (plannerMigration.status === "error" && migrationStatus.type !== "error") {
      migrationStatus = {
        type: "error",
        message: "Could not migrate today's guest plan to your account.",
      };
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
