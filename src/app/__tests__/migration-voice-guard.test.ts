/**
 * v0.30 (docs/design/MIGRATION_VOICE.md D5): every migration a shipped
 * `src/app` surface awaits must route its result through `migrationNotice`.
 *
 * The defect this exists against was not hypothetical: `/journal` awaited its
 * migration without even binding the result for seventeen milestones (the MED
 * bug PR #179 filed), and `/slicer`'s silence was then WRITTEN BY COPYING
 * `/journal`'s, with a comment citing that silence as a convention. Nothing in
 * the gate held a surface to reporting what it ran - `status-message-guard`
 * only forbids an inline `role="alert"`, and a page that renders nothing at
 * all satisfies it perfectly - which is precisely how the silence spread.
 *
 * Two halves, and the scan is NOT trusted alone (the storage-key-census
 * pairing, L-033): a token match over source files is satisfied by dropping
 * `migrationNotice`'s return value on the floor, exactly as `/journal` used
 * to. The behaviour half lives in the page suites (`journal-page.test.tsx`,
 * `slicer-page.test.tsx`, `now-page.test.tsx`, `trends-page.test.tsx`), which
 * assert the rendered DOM by `data-testid` in both the fires and the
 * stays-silent direction. This file's own direct calls below assert the
 * MAPPING, so the seam's rules are checked where they live rather than once
 * per consumer.
 *
 * The corpus is glob-discovered, never hand-listed, so a sixth surface is
 * judged the moment it exists.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { migrationNotice, type MigrationCopy } from "@/lib/migration-notice";
import type { GuestMigrationResult } from "@/lib/guest-migration";

const ROOT = process.cwd();
const APP_DIR = "src/app";

/**
 * Blindness anchors (MIGRATION_VOICE.md D5): two call sites in two DIFFERENT
 * route directories, named as files rather than derived from the walk, so a
 * control that narrows the walker to one directory reddens this assertion
 * instead of passing on a shorter list. These are exactly the two surfaces
 * whose silence this milestone removed; deleting either call for real should
 * fail here too - that is a decision worth making deliberately, not silently.
 */
const CALL_SITE_ANCHORS = [
  "src/app/journal/page.tsx",
  "src/app/slicer/page.tsx",
] as const;

/** Read with line endings normalised, as every guard in this repo reads. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/**
 * Every shipped .ts/.tsx file under `src/app`, tests excluded. The exclusion
 * is the test DIRECTORIES, not a filename convention, because the corpus must
 * be what actually ships.
 */
function walkShippedAppFiles(relDir: string = APP_DIR): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        continue;
      }
      found.push(...walkShippedAppFiles(rel));
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) {
      found.push(rel);
    }
  }
  return found.sort();
}

const AWAIT_MIGRATION = /await\s+[\w.$]*migrateGuest\w*\s*\(/g;
const BOUND_AWAIT = /(?:const|let)\s+(\w+)\s*=\s*await\s+[\w.$]*migrateGuest\w*\s*\(/g;

interface CallSiteFile {
  file: string;
  text: string;
  awaits: number;
  boundIdents: string[];
}

function discoverCallSites(): CallSiteFile[] {
  const sites: CallSiteFile[] = [];
  for (const file of walkShippedAppFiles()) {
    const text = readText(path.join(ROOT, file));
    const awaits = [...text.matchAll(AWAIT_MIGRATION)].length;
    if (awaits === 0) {
      continue;
    }
    const boundIdents = [...text.matchAll(BOUND_AWAIT)].map((m) => m[1]);
    sites.push({ file, text, awaits, boundIdents });
  }
  return sites;
}

describe("migration-voice-guard: the call-site scan", () => {
  it("finds its two anchors in two different route directories", () => {
    const files = discoverCallSites().map((s) => s.file);
    for (const anchor of CALL_SITE_ANCHORS) {
      expect(files, `walker no longer sees ${anchor}`).toContain(anchor);
    }
    // The anchors must really live in different directories, or a narrowed
    // walker could satisfy both from one place.
    const dirs = new Set(CALL_SITE_ANCHORS.map((a) => path.dirname(a)));
    expect(dirs.size).toBe(CALL_SITE_ANCHORS.length);
  });

  it("every shipped src/app migration await binds its result", () => {
    for (const site of discoverCallSites()) {
      expect(
        site.boundIdents.length,
        `${site.file} awaits a migration without binding the result - the ` +
          `exact shape /journal shipped in for seventeen milestones`,
      ).toBe(site.awaits);
    }
  });

  it("every bound result reaches migrationNotice", () => {
    for (const site of discoverCallSites()) {
      for (const ident of site.boundIdents) {
        expect(
          new RegExp(`migrationNotice\\(\\s*${ident}\\s*,`).test(site.text),
          `${site.file} binds "${ident}" but never hands it to migrationNotice`,
        ).toBe(true);
      }
    }
  });
});

/**
 * Source B: the seam itself, called directly so the mapping is asserted
 * rather than assumed (MIGRATION_VOICE.md D5). The scan above proves results
 * REACH `migrationNotice`; these prove what it does with them.
 */
describe("migration-voice-guard: the mapping", () => {
  const copy: MigrationCopy = {
    ok: "ok sentence",
    local: "local sentence",
    error: "error sentence",
  };
  const result = (status: GuestMigrationResult["status"], migratedCount: number) =>
    ({ status, migratedCount }) as GuestMigrationResult;

  it("speaks on the three outcomes that moved or lost something", () => {
    expect(migrationNotice(result("migrated", 3), copy)).toEqual({
      type: "ok",
      message: "ok sentence",
    });
    expect(migrationNotice(result("migrated-locally", 3), copy)).toEqual({
      type: "notice",
      message: "local sentence",
    });
    // An error speaks whatever the count says: it is the one outcome where
    // the records are NOT where the person expects them.
    expect(migrationNotice(result("error", 0), copy)).toEqual({
      type: "error",
      message: "error sentence",
    });
  });

  it("stays silent one-directionally: skipped, already-migrated, zero counts", () => {
    // GUEST_DATA_MIGRATION.md D5, preserved byte for byte: a person who never
    // used the app signed out is never told about a migration.
    expect(migrationNotice(result("skipped", 0), copy)).toEqual({ type: "idle" });
    expect(migrationNotice(result("already-migrated", 0), copy)).toEqual({ type: "idle" });
    expect(migrationNotice(result("migrated", 0), copy)).toEqual({ type: "idle" });
    expect(migrationNotice(result("migrated-locally", 0), copy)).toEqual({ type: "idle" });
  });

  it("returns idle, never an invented sentence, for migrated-locally with no local copy", () => {
    // MIGRATION_VOICE.md D3 / done-when 4. Unreachable in the shipped tree -
    // the only two surfaces without a `local` string are the two whose stores
    // cannot mint `migrated-locally` - and asserted anyway, because this is
    // the only thing standing between "this store has no cloud" and a false
    // "will be copied to your account" promise if a sixth surface gets its
    // copy record wrong.
    const noLocal: MigrationCopy = { ok: "ok sentence", error: "error sentence" };
    expect(migrationNotice(result("migrated-locally", 3), noLocal)).toEqual({
      type: "idle",
    });
  });
});
