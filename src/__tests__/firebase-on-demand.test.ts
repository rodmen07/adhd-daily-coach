/**
 * Drift guard for v0.19 PR3 (D4 in docs/design/PERF_PASS.md): the Firebase
 * SDK must never ride in the first-paint bundle again.
 *
 * The mechanism that took ~670 KB of SDK out of the entry document's scripts
 * is purely structural: no shipped module may VALUE-import a `firebase/*`
 * package at the top level. Type-only imports are erased at compile time and
 * cost nothing; the SDK's runtime code is reached exclusively through dynamic
 * `import()` inside already-async flows (`src/lib/firebase.ts`'s loaders and
 * the modules they serve). One static value import anywhere in the shipped
 * graph would silently drag the whole SDK back into the entry chunk, ship a
 * ~40 % LCP regression, and nothing but a Lighthouse number would say so.
 * This guard reads BOTH sources of that contract - the real source tree and
 * the loader module - so the drift fails a unit test with a filename in the
 * message instead of a perf gate with a chart.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { shippedSourceFiles, withoutComments } from "@/__tests__/helpers/source-scan";

const SRC_DIR = path.resolve(__dirname, "..");

/**
 * Every `import ... from "firebase/..."` statement in `source`, with the
 * verbatim statement text kept so a failure names what it found. Handles
 * multiline statements; comments are stripped by the caller so prose cannot
 * trip it.
 */
function firebaseStaticImports(source: string): string[] {
  return [...source.matchAll(/import\s[^;]*?from\s*["']firebase\/[^"']+["']/g)].map(
    (match) => match[0].replace(/\s+/g, " "),
  );
}

/** True when the statement is fully erased at compile time (`import type`). */
function isTypeOnly(statement: string): boolean {
  return /^import\s+type\s/.test(statement);
}

describe("Firebase loads on demand, never at first paint", () => {
  const files = shippedSourceFiles(SRC_DIR);
  const byFile = files.map((file) => ({
    file,
    statements: firebaseStaticImports(withoutComments(readFileSync(file, "utf8"))),
  }));

  it("no shipped module value-imports a firebase/* package at the top level", () => {
    const offenders = byFile
      .map(({ file, statements }) => ({
        file: path.relative(SRC_DIR, file).replace(/\\/g, "/"),
        valueImports: statements.filter((statement) => !isTypeOnly(statement)),
      }))
      .filter(({ valueImports }) => valueImports.length > 0);

    expect(offenders).toEqual([]);
  });

  it("the SDK is reachable, through dynamic import in the loader module", () => {
    // The flip side of the rule above: the ban is on WHEN the SDK loads, not
    // whether. If the loaders lost their dynamic imports the app would break
    // loudly, but this assertion keeps the pair honest in one place: entry
    // graph clean AND the on-demand path present.
    const loader = withoutComments(
      readFileSync(path.join(SRC_DIR, "lib", "firebase.ts"), "utf8"),
    );

    expect(loader).toMatch(/await import\(["']firebase\/app["']\)/);
    expect(loader).toMatch(/await import\(["']firebase\/auth["']\)/);
    expect(loader).toMatch(/await import\(["']firebase\/firestore["']\)/);
  });

  it("control: the scan sees the type-only imports it is supposed to tolerate", () => {
    // Blindness control, anchored on NAMED files in DIFFERENT directories
    // rather than on the walk's own output (the self-referential form shipped
    // blind twice before, PR #120 and PR #138 both had to rewrite it). These
    // two files are known to carry legitimate `import type ... from
    // "firebase/..."` statements; a walk or regex that cannot see them cannot
    // be trusted to see an offender either.
    const anchors = [
      path.join(SRC_DIR, "lib", "firebase.ts"),
      path.join(SRC_DIR, "app", "hooks", "use-coach-auth.ts"),
    ];

    for (const anchor of anchors) {
      const entry = byFile.find(({ file }) => file === anchor);
      expect(entry, `${anchor} missing from the walk`).toBeDefined();
      expect(entry!.statements.length).toBeGreaterThan(0);
      expect(entry!.statements.every(isTypeOnly)).toBe(true);
    }
  });
});
