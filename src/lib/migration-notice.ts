import type { AsyncStatus } from "@/lib/async-status";
import type { GuestMigrationResult } from "@/lib/guest-migration";

/**
 * The sentences ONE surface says about its own guest-to-account migration.
 *
 * The copy stays per surface and only the decision is shared (v0.30,
 * docs/design/MIGRATION_VOICE.md D2): the lines name what moved - "Your earlier
 * focus sessions are here now." - and a generic "Your data is here now." would
 * be a real regression in the calm specificity this product is built on.
 */
export type MigrationCopy = {
  /** A copy that completed and reached the account. */
  ok: string;
  /**
   * A copy that completed but landed in THIS BROWSER. Omitted by a store with
   * no cloud twin (MIGRATION_VOICE.md D3): `slicer.ts` and `planner-state.ts`
   * never call `guestMigrationLandedLocally`, so `migrated-locally` cannot be
   * produced there and a "will be copied to your account" line would promise a
   * cloud that does not exist (MIGRATION_DESTINATION.md D2).
   */
  local?: string;
  /** A copy that failed. The records are still safe where they are. */
  error: string;
};

/**
 * Map a finished guest migration onto the status a surface renders (v0.30,
 * docs/design/MIGRATION_VOICE.md D1).
 *
 * This is the single home for a decision that was written by hand three times
 * (`/now`, `/trends`, `planner-session.ts`) and was missing entirely on two
 * more (`/journal`, `/slicer`), which is how the silence spread by imitation:
 * `/slicer`'s own comment cited `/journal`'s silence as a convention rather
 * than as the open bug it was.
 *
 * **The silence rule is preserved exactly, not re-decided here**
 * (`GUEST_DATA_MIGRATION.md` D5): the report is calm and one-directional, so
 * only a copy that actually moved something says anything. `skipped`,
 * `already-migrated`, and any outcome whose `migratedCount` is 0 return
 * `{ type: "idle" }` - a person who never used the app signed out should never
 * be told about a migration.
 *
 * **A pure function rather than a hook** because two of the five call sites are
 * not components at all (`planner-session.ts` is a plain async function that
 * `/` awaits), so a hook would fit three sites and force the other two to keep
 * their own copy - which is the defect, not the fix. Being drivable without
 * rendering a page is also what lets a test observe the mapping directly
 * instead of reading source text for it.
 */
export function migrationNotice(
  result: GuestMigrationResult,
  copy: MigrationCopy,
): AsyncStatus {
  // `error` is reported whatever the count says, matching all three call sites
  // this replaces: a failure is the one outcome where the records are NOT where
  // the person expects them, and a zero count there means nothing crossed
  // rather than that nothing needed to.
  if (result.status === "error") {
    return { type: "error", message: copy.error };
  }

  // The one-directional rule. A completed copy that moved nothing is the same
  // non-event as "skipped", so it says nothing.
  if (result.migratedCount <= 0) {
    return { type: "idle" };
  }

  if (result.status === "migrated") {
    return { type: "ok", message: copy.ok };
  }

  if (result.status === "migrated-locally") {
    // No `local` sentence means this store has no cloud twin, so there is
    // nothing honest to say - and inventing one would promise an account copy
    // that will never be retried. Silence is the correct answer, and it is the
    // only thing standing between "this store has no cloud" and a false
    // promise if a sixth surface gets it wrong (MIGRATION_VOICE.md D3).
    return copy.local ? { type: "notice", message: copy.local } : { type: "idle" };
  }

  // "skipped" and "already-migrated": the copy did not happen, so there is no
  // destination claim to make.
  return { type: "idle" };
}
