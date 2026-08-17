import type { MigrationCopy } from "@/lib/migration-notice";

/**
 * The TWO sentences `/slicer` says about its guest-to-account migration, and
 * the omission is the decision (v0.30, docs/design/MIGRATION_VOICE.md D3).
 *
 * `slicer.ts` never calls `guestMigrationLandedLocally` - it pins its
 * marker's backend segment to a literal `"local"` and has no Firestore twin -
 * so `migrated-locally` cannot be produced on this surface. A `local`
 * sentence here would be dead copy that also promises "copied to your
 * account" about a cloud that does not exist (MIGRATION_DESTINATION.md D2).
 * `migrationNotice` returns `{ type: "idle" }` for that combination rather
 * than inventing a line, and its suite asserts so directly.
 *
 * Reopen alongside the store: if `slicer.ts` ever gains a `firestore-*.ts`
 * twin, the increment is this record's `local` string plus nothing else.
 */
export const SLICED_TASK_MIGRATION_COPY: MigrationCopy = {
  ok: "Your earlier sliced tasks are here now.",
  error: "Could not bring your earlier sliced tasks across.",
};
