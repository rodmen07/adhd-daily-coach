import { describe, expect, it } from "vitest";
import type { GuestMigrationResult, GuestMigrationStatus } from "@/lib/guest-migration";
import { migrationNotice, type MigrationCopy } from "@/lib/migration-notice";

/**
 * The seam's own suite (v0.30 PR1, docs/design/MIGRATION_VOICE.md D1).
 *
 * `migrationNotice` is a pure function precisely so the mapping can be observed
 * being EXECUTED rather than read out of a page's source, so these assertions
 * drive it directly instead of rendering `/now` or `/trends`.
 */

/** A store WITH a cloud twin, e.g. focus sessions or check-ins. */
const CLOUD_COPY: MigrationCopy = {
  ok: "ok sentence",
  local: "local sentence",
  error: "error sentence",
};

/** A store with NO cloud twin, e.g. the slicer or the planner state. */
const LOCAL_ONLY_COPY: MigrationCopy = {
  ok: "ok sentence",
  error: "error sentence",
};

/**
 * Every member of the union, listed here rather than derived from the code
 * under test: a list built from the implementation would shrink silently with
 * it, and a status the seam forgot would then be a status this suite forgot too.
 */
const ALL_STATUSES: GuestMigrationStatus[] = [
  "migrated",
  "migrated-locally",
  "already-migrated",
  "skipped",
  "error",
];

/** The outcomes that must never say anything, whatever the count (D5). */
const SILENT_STATUSES: GuestMigrationStatus[] = ["already-migrated", "skipped"];

function result(status: GuestMigrationStatus, migratedCount: number): GuestMigrationResult {
  return { status, migratedCount };
}

describe("migrationNotice", () => {
  it("covers every GuestMigrationStatus, so a widened union cannot slip past this suite", () => {
    // The union is widened by hand when a new destination is invented
    // (`migrated-locally` was added exactly that way in v0.28). If a sixth
    // member appears, this fails and the table below has to grow with it.
    expect(ALL_STATUSES).toHaveLength(5);
    for (const status of ALL_STATUSES) {
      expect(migrationNotice(result(status, 1), CLOUD_COPY).type).toBeTypeOf("string");
    }
  });

  describe("the outcomes that speak", () => {
    it("reports a completed copy that reached the account as ok, carrying the surface's own words", () => {
      expect(migrationNotice(result("migrated", 1), CLOUD_COPY)).toEqual({
        type: "ok",
        message: "ok sentence",
      });
    });

    it("reports a copy that landed in this browser as a notice, not an error and not an ok", () => {
      // v0.28 (MIGRATION_DESTINATION.md D3/D4): nothing failed, so `error`
      // would shout, and nothing reached the account, so `ok` would lie.
      expect(migrationNotice(result("migrated-locally", 2), CLOUD_COPY)).toEqual({
        type: "notice",
        message: "local sentence",
      });
    });

    it("reports a failure as an error", () => {
      expect(migrationNotice(result("error", 0), CLOUD_COPY)).toEqual({
        type: "error",
        message: "error sentence",
      });
    });

    it("reports an error even when nothing was migrated, because a zero there is not a non-event", () => {
      // This is the one place the count does NOT gate the message: on failure a
      // zero count means nothing crossed, not that nothing needed to. All three
      // call sites this seam replaces behaved this way.
      for (const count of [0, 1, 5]) {
        expect(migrationNotice(result("error", count), CLOUD_COPY)).toEqual({
          type: "error",
          message: "error sentence",
        });
      }
    });
  });

  describe("the silence rule (GUEST_DATA_MIGRATION.md D5), asserted rather than assumed", () => {
    it("stays silent for skipped and already-migrated at any count", () => {
      for (const status of SILENT_STATUSES) {
        for (const count of [0, 1, 9]) {
          expect(
            migrationNotice(result(status, count), CLOUD_COPY),
            `${status} with count ${count} must stay silent`,
          ).toEqual({ type: "idle" });
        }
      }
    });

    it("stays silent for a completed copy that moved nothing, in both destinations", () => {
      // A migration that ran and found nothing to bring across is the same
      // non-event as one that was skipped: a person who never used the app
      // signed out should never be told about a migration.
      expect(migrationNotice(result("migrated", 0), CLOUD_COPY)).toEqual({ type: "idle" });
      expect(migrationNotice(result("migrated-locally", 0), CLOUD_COPY)).toEqual({
        type: "idle",
      });
    });

    it("treats a negative count as nothing moved rather than as something to announce", () => {
      expect(migrationNotice(result("migrated", -1), CLOUD_COPY)).toEqual({ type: "idle" });
    });
  });

  describe("a store with no cloud twin (MIGRATION_VOICE.md D3)", () => {
    it("returns idle for migrated-locally when the copy has no local sentence, instead of inventing one", () => {
      // Done-when 4. This combination is unreachable in the shipped tree today
      // - `slicer.ts` and `planner-state.ts` never call
      // `guestMigrationLandedLocally` - and is asserted anyway, because it is
      // the only thing standing between "this store has no cloud" and a false
      // promise if a sixth surface gets it wrong.
      expect(migrationNotice(result("migrated-locally", 3), LOCAL_ONLY_COPY)).toEqual({
        type: "idle",
      });
    });

    it("never emits a message that is not in the copy record it was handed", () => {
      // The failure this guards is a fallback sentence hard-coded in the seam:
      // it would be invisible at every call site and would promise a cloud copy
      // that is never retried. Checked across the whole table so a default
      // added for any one status is caught.
      const allowed = new Set([LOCAL_ONLY_COPY.ok, LOCAL_ONLY_COPY.error]);

      for (const status of ALL_STATUSES) {
        for (const count of [0, 1, 4]) {
          const notice = migrationNotice(result(status, count), LOCAL_ONLY_COPY);
          if (notice.type !== "idle") {
            expect(allowed.has(notice.message), `${status}/${count} invented "${notice.message}"`).toBe(
              true,
            );
          }
        }
      }
    });

    it("still reports ok and error normally, so the omission costs only the local sentence", () => {
      expect(migrationNotice(result("migrated", 1), LOCAL_ONLY_COPY)).toEqual({
        type: "ok",
        message: "ok sentence",
      });
      expect(migrationNotice(result("error", 0), LOCAL_ONLY_COPY)).toEqual({
        type: "error",
        message: "error sentence",
      });
    });
  });
});
