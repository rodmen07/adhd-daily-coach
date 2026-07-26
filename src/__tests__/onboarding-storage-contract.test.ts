/**
 * One storage key, one module that knows it.
 *
 * The onboarding record lives under a single localStorage key, but until
 * 2026-07-26 four files spelled that key independently and three of them
 * parsed it their own way:
 *
 * - `src/lib/onboarding.ts` exported the constant and the only zod-validated
 *   reader, which nothing imported;
 * - `src/lib/planner-state.ts` kept a private copy of the constant and a
 *   hand-rolled per-field parse;
 * - `src/app/page.tsx` used the raw literal twice - once to decide whether a
 *   person had been through onboarding (a bare truthiness check on the raw
 *   string, so any leftover value counted as a finished onboarding) and once
 *   to write a skip record by hand.
 *
 * A one-time cleanup would not have stopped a fifth spelling appearing, so
 * this file reads the real source tree and fails when one does. It reads BOTH
 * sources: the literal it scans for is asserted equal to the constant the app
 * actually exports, so renaming the key cannot leave this guard hunting for a
 * string nothing uses any more.
 *
 * Test files are excluded on purpose: seeding localStorage directly is how a
 * test reproduces a real browser, and that is legitimately done by key.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { shippedSourceFiles, withoutComments } from "@/__tests__/helpers/source-scan";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

/** The one module allowed to spell the key. */
const CANONICAL_MODULE = "src/lib/onboarding.ts";

/**
 * True when the source spells the key as a literal, ignoring comments so a
 * module doc may name the key in prose (this app's readers do).
 */
export function spellsStorageKey(source: string, key: string): boolean {
  return withoutComments(source).includes(key);
}

const SHIPPED_FILES = shippedSourceFiles(SRC_DIR).map((absolute) => ({
  file: path.relative(ROOT, absolute).replace(/\\/g, "/"),
  source: readFileSync(absolute, "utf-8"),
}));

describe("onboarding storage key contract", () => {
  it("scans real source for the key the app really exports", () => {
    // A walk that reaches only one subtree would report "exactly one spelling"
    // for the happiest of wrong reasons, so both trees are named explicitly
    // rather than trusted to a file count: `src/lib` alone already clears any
    // plausible threshold.
    const trees = ["src/lib/", "src/app/"];
    for (const tree of trees) {
      expect(
        SHIPPED_FILES.some(({ file }) => file.startsWith(tree)),
        `the file walk never reached ${tree}, so a clean result there means nothing`,
      ).toBe(true);
    }
    expect(SHIPPED_FILES.length, "the file walk found almost nothing under src/").toBeGreaterThan(30);

    expect(
      ONBOARDING_STORAGE_KEY,
      "the exported key changed, so the scan below would be hunting for a dead string",
    ).toBe("calm-daily-coach:onboarding");

    const canonical = SHIPPED_FILES.find(({ file }) => file === CANONICAL_MODULE);
    expect(canonical, `the walk never reached ${CANONICAL_MODULE}, so its silence means nothing`).toBeDefined();
    expect(
      spellsStorageKey(canonical!.source, ONBOARDING_STORAGE_KEY),
      `${CANONICAL_MODULE} no longer spells the key, so this guard can no longer tell a copy from the original`,
    ).toBe(true);
  });

  it("lets exactly one shipped module spell the onboarding storage key", () => {
    const spellings = SHIPPED_FILES.filter(({ source }) =>
      spellsStorageKey(source, ONBOARDING_STORAGE_KEY),
    ).map(({ file }) => file);

    expect(
      spellings,
      `import ONBOARDING_STORAGE_KEY (and the readers beside it) from @/lib/onboarding instead of respelling the key: a second spelling is how this record ended up with three different validation contracts`,
    ).toEqual([CANONICAL_MODULE]);
  });

  it("keeps the readers wired to that module", () => {
    const consumers = ["src/lib/planner-state.ts", "src/app/page.tsx"];

    for (const consumer of consumers) {
      const entry = SHIPPED_FILES.find(({ file }) => file === consumer);
      expect(entry, `${consumer} disappeared from the walk`).toBeDefined();
      expect(
        /from "@\/lib\/onboarding"/.test(entry!.source),
        `${consumer} reads onboarding preferences, so it must go through @/lib/onboarding rather than localStorage directly`,
      ).toBe(true);
    }
  });

  it("catches a stray spelling and forgives a comment (negative control)", () => {
    const key = ONBOARDING_STORAGE_KEY;

    expect(spellsStorageKey(`const k = "${key}";`, key), "a raw literal must be caught").toBe(true);
    expect(
      spellsStorageKey(`localStorage.getItem("${key}")`, key),
      "an inline read must be caught",
    ).toBe(true);
    expect(
      spellsStorageKey(`/** Stored under ${key}. */\nimport { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";`, key),
      "prose naming the key is documentation, not a second spelling",
    ).toBe(false);
    expect(
      spellsStorageKey(`import { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";`, key),
      "importing the constant is the behaviour this guard wants",
    ).toBe(false);
  });
});
