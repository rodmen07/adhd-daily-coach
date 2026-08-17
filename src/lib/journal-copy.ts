import type { MigrationCopy } from "@/lib/migration-notice";

/**
 * The three sentences `/journal` says about its own guest-to-account migration
 * (v0.30, docs/design/MIGRATION_VOICE.md D3).
 *
 * Three rather than two because `journal-store.ts` HAS a Firestore twin:
 * `guestMigrationLandedLocally` is minted at journal-store.ts:146/176/198, so
 * `migrated-locally` is a real outcome on this surface and its sentence is an
 * honest one. Contrast `/slicer` (slicer-copy.ts), where the same sentence
 * would promise a cloud that does not exist.
 *
 * Kept in a module beside the store rather than inline in the page (D2/D8),
 * in the same style as `FOCUS_SESSION_MIGRATION_COPY`: the copy stays per
 * surface - the lines name what moved - and only the mapping is shared.
 */
export const JOURNAL_MIGRATION_COPY: MigrationCopy = {
  ok: "Your earlier journal entries are here now.",
  local:
    "Your earlier journal entries are safe in this browser. They will be copied to your account next time it can be reached.",
  error: "Could not bring your earlier journal entries across.",
};
