/**
 * Every localStorage key the app writes is either in the export's manifest or
 * excluded from it on purpose. Nothing is in neither.
 *
 * Source A: `STORE_MANIFEST` and `EXCLUDED_KEYS` in
 *   `src/lib/workspace-export.ts` - hand-declared, one row per key family.
 * Source B: the shipped tree - every `localStorage.getItem/setItem/removeItem`
 *   call site under `src/`, with `__tests__` excluded, each resolved to the
 *   constant, template or key builder it actually keys on.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * v0.29 ships a button that writes "everything this browser holds for you" into
 * one file. The failure that button has by construction is not a crash: it is
 * going quietly STALE. The next feature that adds a store leaves the download
 * silently incomplete, and nobody finds out from the app - they find out from
 * the person who trusted the file.
 *
 * The manifest is declared rather than discovered by prefix for the reasons in
 * `workspace-export.ts` (a prefix rule drops `focus-adhd-coach:slicer` and
 * swallows six siblings of the planner key). A declared list is only as good as
 * the discipline maintaining it, and this repo's answer to "discipline" has
 * consistently been a check.
 *
 * WHAT THIS SUITE IS NOT
 * ----------------------
 * A census is a token match over source files, which is a defect wearing a
 * test's clothes: a comment mentioning a key would satisfy it, and it would
 * still pass if `collectWorkspaceExport` returned `{}`. It ships PAIRED with
 * `src/lib/__tests__/workspace-export.test.ts`, which seeds a jsdom
 * localStorage through each store's real public write function and asserts the
 * collector returns what was written. This suite proves the manifest is
 * COMPLETE; that one proves it is CORRECT. Neither alone is evidence, and the
 * control that proves it (delete a manifest row AND its call-site constant, so
 * the census is satisfied and the round-trip reddens) is recorded in the PR
 * that shipped both.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  EXCLUDED_KEYS,
  STORE_MANIFEST,
  type StoreManifestEntry,
} from "@/lib/workspace-export";

const ROOT = process.cwd();

/**
 * The whole shipped source tree, not a hand-listed pair of directories.
 *
 * The design doc names `src/lib/**` and `src/app/**`; walking `src` instead is
 * strictly wider and cannot go blind when a third top-level directory appears.
 * `__tests__` directories and `*.test.*` files are excluded - the suites
 * legitimately write storage keys, and treating their fixtures as production
 * call sites would make the census demand manifest rows for test data.
 */
const SCAN_ROOT = "src";

/**
 * Anchors for the blindness control, named as FILES in DIFFERENT trees.
 *
 * A control that loops over the scan's own directory list is not a control:
 * deleting an entry blinds the walk and empties the loop in one edit, which is
 * the mistake `roadmap-guard-count.test.ts` records being caught by running the
 * sabotage rather than by reading the code. These two key families are written
 * from `src/lib` and from `src/app/components` respectively, so a walk that
 * stops reaching either subtree fails here instead of passing on a shorter
 * list.
 */
const WALK_ANCHORS = [
  { keyFamily: "calm-daily-coach:challenges", file: "src/lib/challenges.ts" },
  { keyFamily: "calm-daily-coach:theme", file: "src/app/components/theme-toggle.tsx" },
];

/**
 * Call sites whose key expression is NOT statically resolvable from the file it
 * appears in, each mapped to the family it really writes.
 *
 * This is not an escape hatch for anything awkward: an entry has to name the
 * exact expression text, and both halves are checked below. The entry dies if
 * the expression stops appearing (so a stale row cannot sit here silently), and
 * the family has to be declared in the same file (so the mapping cannot be
 * invented).
 */
const INDIRECT_CALL_SITES = [
  {
    file: "src/lib/guest-migration.ts",
    expression: "plan.markerKey",
    keyFamily: "calm-daily-coach-migrated-guest",
    reason:
      "guestMigrationMarker() concatenates the prefix constant with the scope, the backend " +
      "and an optional collection segment through a conditional rather than one template " +
      "literal, and the result travels to the copier as a plan field. The prefix constant is " +
      "declared in this same file, which is what makes the mapping checkable.",
  },
];

/** The minimum number of call sites a healthy walk finds. 34 exist at `bf69909`;
 * the floor is deliberately below that so ordinary churn does not move it, and
 * deliberately above zero so an empty walk fails instead of passing. */
const MIN_CALL_SITES = 25;

/** Read with line endings normalised: CRLF on Windows, LF on the Linux runner. */
function readText(absPath: string): string {
  return readFileSync(absPath, "utf-8").replace(/\r\n/g, "\n");
}

/** Every shipped `.ts`/`.tsx` under `src`, repo-relative, tests excluded. */
function shippedSourceFiles(): string[] {
  const found: string[] = [];

  function walk(relDir: string): void {
    for (const entry of readdirSync(path.join(ROOT, relDir), { withFileTypes: true })) {
      const relPath = `${relDir}/${entry.name}`;

      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") {
          walk(relPath);
        }
        continue;
      }

      if (!entry.isFile() || entry.name.includes(".test.")) {
        continue;
      }

      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        found.push(relPath);
      }
    }
  }

  walk(SCAN_ROOT);
  return found.sort();
}

/**
 * The first argument of a call, read from just after its `(`.
 *
 * Character-by-character rather than by regex because the argument can span
 * lines (`reminder-preferences.ts` and `slicer.ts` both wrap it), and because a
 * key expression can contain `(`, `,` and quotes inside a template. Depth and
 * quoting are both tracked; the argument ends at the first `,` or `)` seen at
 * depth 0 outside any quote.
 */
export function readFirstArgument(source: string, openParenIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  let index = openParenIndex + 1;

  for (; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) {
        break;
      }
      depth -= 1;
      continue;
    }

    if (char === "," && depth === 0) {
      break;
    }
  }

  return source.slice(openParenIndex + 1, index).trim();
}

/** `const NAME = "literal";` in one file, exported or not. */
function stringConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const pattern = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*"([^"]*)"\s*;/g;

  for (const match of source.matchAll(pattern)) {
    constants.set(match[1], match[2]);
  }

  return constants;
}

/** `function name(...) { return `template`; }` in one file - the key builders. */
function templateBuilders(source: string): Map<string, string> {
  const builders = new Map<string, string>();
  const pattern =
    /(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*string\s*)?\{\s*return\s+`([^`]*)`\s*;\s*\}/g;

  for (const match of source.matchAll(pattern)) {
    builders.set(match[1], match[2]);
  }

  return builders;
}

/**
 * The leading fixed text of a template literal, with `${CONST}` heads expanded.
 *
 * Resolution stops at the first interpolation that is NOT a known string
 * constant, because that is the scope placeholder - exactly the boundary
 * between a key family and one person's key.
 */
function resolveTemplate(template: string, constants: Map<string, string>): string {
  let resolved = "";
  let index = 0;

  while (index < template.length) {
    const next = template.indexOf("${", index);

    if (next === -1) {
      resolved += template.slice(index);
      break;
    }

    resolved += template.slice(index, next);

    const close = template.indexOf("}", next);
    if (close === -1) {
      break;
    }

    const expression = template.slice(next + 2, close).trim();
    const constant = constants.get(expression);
    if (constant === undefined) {
      break;
    }

    resolved += constant;
    index = close + 1;
  }

  return resolved;
}

/** A resolved literal, trimmed of the separator that precedes the scope. */
function keyFamilyFromLiteral(literal: string): string | null {
  const family = literal.replace(/[:-]+$/, "");
  return family.length > 0 ? family : null;
}

/**
 * Resolve one key expression to its key family, or null when the file alone
 * cannot say.
 */
export function resolveKeyFamily(
  expression: string,
  constants: Map<string, string>,
  builders: Map<string, string>,
): string | null {
  const stringLiteral = /^"([^"]*)"$|^'([^']*)'$/.exec(expression);
  if (stringLiteral) {
    return keyFamilyFromLiteral(stringLiteral[1] ?? stringLiteral[2] ?? "");
  }

  if (expression.startsWith("`") && expression.endsWith("`")) {
    return keyFamilyFromLiteral(resolveTemplate(expression.slice(1, -1), constants));
  }

  if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
    const constant = constants.get(expression);
    return constant === undefined ? null : keyFamilyFromLiteral(constant);
  }

  const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(expression);
  if (call) {
    const template = builders.get(call[1]);
    return template === undefined ? null : keyFamilyFromLiteral(resolveTemplate(template, constants));
  }

  return null;
}

type CallSite = {
  file: string;
  line: number;
  expression: string;
  keyFamily: string | null;
};

/** Every localStorage call site in the shipped tree, resolved where possible. */
function discoverCallSites(): CallSite[] {
  const sites: CallSite[] = [];

  for (const file of shippedSourceFiles()) {
    const source = readText(path.join(ROOT, file));
    if (!source.includes("localStorage.")) {
      continue;
    }

    const constants = stringConstants(source);
    const builders = templateBuilders(source);

    for (const match of source.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(/g)) {
      const openParen = match.index + match[0].length - 1;
      const expression = readFirstArgument(source, openParen);

      sites.push({
        file,
        line: source.slice(0, match.index).split("\n").length,
        expression,
        keyFamily: resolveKeyFamily(expression, constants, builders),
      });
    }
  }

  return sites;
}

const callSites = discoverCallSites();

/** Families the tree demonstrably writes: resolved directly, or declared
 * indirect and therefore checked against the file that owns them. */
const writtenFamilies = new Map<string, string[]>();
for (const site of callSites) {
  const family =
    site.keyFamily ??
    INDIRECT_CALL_SITES.find(
      (indirect) => indirect.file === site.file && indirect.expression === site.expression,
    )?.keyFamily ??
    null;

  if (family === null) {
    continue;
  }

  const files = writtenFamilies.get(family) ?? [];
  if (!files.includes(site.file)) {
    files.push(site.file);
  }
  writtenFamilies.set(family, files);
}

function describeSite(site: CallSite): string {
  return `${site.file}:${site.line} -> ${site.expression}`;
}

describe("localStorage key census vs. the workspace export manifest", () => {
  it("walks both shipped trees and finds the keys written from each (blindness control)", () => {
    expect(
      callSites.length,
      "the walk found almost no localStorage call sites, which means it went blind rather " +
        "than that the app stopped using storage",
    ).toBeGreaterThanOrEqual(MIN_CALL_SITES);

    for (const anchor of WALK_ANCHORS) {
      expect(
        writtenFamilies.get(anchor.keyFamily) ?? [],
        `the scan did not resolve ${anchor.keyFamily} in ${anchor.file}; either the walk no ` +
          "longer reaches that subtree, the resolver stopped following that shape, or the key " +
          "moved - and all three need a deliberate answer",
      ).toContain(anchor.file);
    }
  });

  it("resolves every call site to a key family or a declared indirection", () => {
    const unexplained = callSites.filter(
      (site) =>
        site.keyFamily === null &&
        !INDIRECT_CALL_SITES.some(
          (indirect) => indirect.file === site.file && indirect.expression === site.expression,
        ),
    );

    expect(
      unexplained.map(describeSite),
      "a localStorage call site keys on something this census cannot resolve. Teach the " +
        "resolver the shape, or add the call site to INDIRECT_CALL_SITES with the family it " +
        "writes and why. An unresolved call site is indistinguishable from an unexported store.",
    ).toEqual([]);
  });

  it("keeps every declared indirection live and honest", () => {
    for (const indirect of INDIRECT_CALL_SITES) {
      expect(
        callSites.some(
          (site) => site.file === indirect.file && site.expression === indirect.expression,
        ),
        `INDIRECT_CALL_SITES still claims ${indirect.file} keys on "${indirect.expression}", ` +
          "and no such call site exists any more. Delete the row.",
      ).toBe(true);

      expect(
        readText(path.join(ROOT, indirect.file)),
        `INDIRECT_CALL_SITES maps ${indirect.expression} to ${indirect.keyFamily}, but ` +
          `${indirect.file} does not contain that key at all`,
      ).toContain(indirect.keyFamily);

      expect(indirect.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("declares every key family the shipped tree writes", () => {
    const declared = new Set<string>([
      ...STORE_MANIFEST.map((entry) => entry.keyFamily),
      ...EXCLUDED_KEYS.map((excluded) => excluded.keyFamily),
    ]);

    const undeclared = [...writtenFamilies.entries()]
      .filter(([family]) => !declared.has(family))
      .map(([family, files]) => `${family} (written from ${files.join(", ")})`);

    expect(
      undeclared,
      "a module writes a localStorage key that the workspace export neither carries nor " +
        "excludes, so the file a person downloads would be missing it. Add a STORE_MANIFEST " +
        "row, or an EXCLUDED_KEYS row with a reason.",
    ).toEqual([]);
  });

  it("carries no manifest row the shipped tree does not actually write", () => {
    const missing = STORE_MANIFEST.filter(
      (entry: StoreManifestEntry) => !writtenFamilies.has(entry.keyFamily),
    ).map((entry) => `${entry.id} (${entry.keyFamily})`);

    expect(
      missing,
      "STORE_MANIFEST declares a store nothing writes. Either the store was removed and the " +
        "row is dead, or the key was renamed and the export is now reading a key that will " +
        "always be empty.",
    ).toEqual([]);
  });

  it("declares each store in the module that really owns its key", () => {
    for (const entry of STORE_MANIFEST) {
      expect(
        writtenFamilies.get(entry.keyFamily) ?? [],
        `STORE_MANIFEST says ${entry.id} is declared in ${entry.declaredIn}, but no call site ` +
          "there writes that family",
      ).toContain(entry.declaredIn);
    }
  });

  it("keeps ids and key families unique", () => {
    const ids = STORE_MANIFEST.map((entry) => entry.id);
    const families = STORE_MANIFEST.map((entry) => entry.keyFamily);

    expect(new Set(ids).size, `duplicate manifest id: ${ids.join(", ")}`).toBe(ids.length);
    expect(
      new Set(families).size,
      `two manifest rows claim the same key family: ${families.join(", ")}`,
    ).toBe(families.length);
  });

  it("keeps every deliberate exclusion accountable", () => {
    // EXCLUDED_KEYS is empty today and this loop is therefore vacuous, which is
    // said out loud rather than hidden: what it protects is the moment the list
    // stops being empty. The rule that is NOT vacuous is the completeness check
    // above, whose source A is the manifest UNION this list.
    for (const excluded of EXCLUDED_KEYS) {
      expect(
        excluded.reason.trim().length,
        `EXCLUDED_KEYS drops ${excluded.keyFamily} without saying why`,
      ).toBeGreaterThan(0);

      expect(
        writtenFamilies.has(excluded.keyFamily),
        `EXCLUDED_KEYS excludes ${excluded.keyFamily}, which nothing writes any more`,
      ).toBe(true);

      expect(
        readText(path.join(ROOT, excluded.declaredIn)),
        `EXCLUDED_KEYS says ${excluded.keyFamily} is declared in ${excluded.declaredIn}`,
      ).toContain(excluded.keyFamily);
    }
  });
});
