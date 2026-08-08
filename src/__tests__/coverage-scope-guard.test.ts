/**
 * Drift guard between the coverage report's SCOPE and the source tree it
 * claims to measure.
 *
 * Source A: `vitest.config.ts` - `test.coverage.include`, read from the
 *   imported config object rather than grepped out of the file's text, so this
 *   guard sees the patterns vitest actually uses.
 * Source B: the filesystem - every shipped `.ts`/`.tsx` module under `src/`,
 *   discovered by the same walk the other source-scanning guards use.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `coverage.include` read `["src/lib/**\/*.ts"]` from the day coverage was
 * turned on until 2026-08-07, so the entire `src/app/**` UI layer - 14 pages,
 * 17 components and 3 hooks - was not measured. The failure mode is worse than
 * a low number: an untested UI file did not show up as a 0% row, it did not
 * show up AT ALL, so the headline percentage was a lib-layer figure that rose
 * steadily while `src/app/hooks/use-coach-auth.ts`, the hook every route
 * depends on, sat with no test of any kind from 2026-06-27 to 2026-08-01. Four
 * separate backlog entries quoted that percentage ("84.24%", "86.31%",
 * "91.72%", "91.24%") as if it described the app.
 *
 * The tests under `src/app/**` always ran and always gated CI. Only the
 * MEASUREMENT was blind, which is exactly why nothing else caught it: every
 * gate was green and the number was rising.
 *
 * WHAT THIS GUARD ASSERTS, AND WHY IT IS NOT AN EXISTENCE CHECK
 * ------------------------------------------------------------
 * "The config mentions `src/**`" would be satisfied by a comment, and a
 * partial widening (`src/**\/*.ts` alone, dropping `.tsx`) reads as fixed while
 * leaving every page and component invisible. So the assertion is a real
 * matcher run over a real file list: each discovered module must be matched by
 * at least one configured pattern, using `path.posix.matchesGlob`, Node's own
 * glob implementation.
 *
 * Both directions are checked. A file outside every pattern is unmeasured
 * source; a pattern matching no file is dead scope config, which is how a typo
 * ("src/ap/**") would otherwise silently shrink the report back.
 *
 * A consequence worth stating out loud: adding a source directory outside the
 * configured patterns fails this test. That is the intended cost, and it is
 * the alternative to what the repo had, which was a number describing a
 * different codebase.
 *
 * The node environment below is load-bearing, not tidiness: importing
 * `vitest.config.ts` pulls in `vitest/config` -> vite -> esbuild, and esbuild
 * refuses to load under jsdom ("new TextEncoder().encode('') instanceof
 * Uint8Array is incorrectly false"). This file renders nothing and touches no
 * DOM, so it has no reason to be in jsdom anyway.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import path from "node:path";
import vitestConfig from "../../vitest.config";
import { shippedSourceFiles } from "@/__tests__/helpers/source-scan";

const ROOT = process.cwd();

/**
 * Anchors for the blindness control, named as FILES and written out here
 * independently of the walk.
 *
 * `roadmap-guard-count.test.ts` learned this the hard way: a control that
 * derives its expectations from the thing it is checking passes while the scan
 * is blind. These four are named by hand, one per source directory that
 * exists, so a walk that loses a directory fails here instead of quietly
 * agreeing about a smaller repo.
 *
 * `use-coach-auth.ts` leads the list on purpose - it is the file whose
 * invisibility this guard exists to prevent.
 */
const REQUIRED_IN_SCOPE = [
  "src/app/hooks/use-coach-auth.ts",
  "src/app/components/site-nav.tsx",
  "src/app/page.tsx",
  "src/lib/routes.ts",
] as const;

/** The configured patterns, from the config object vitest itself loads. */
function configuredIncludePatterns(): string[] {
  const coverage = vitestConfig.test?.coverage;

  if (!coverage || !("include" in coverage) || !coverage.include) {
    return [];
  }

  return [...coverage.include];
}

/** Repo-relative, forward-slashed paths: glob patterns are written that way,
 * and this repo is checked out on Windows as well as on the Linux runner. */
function shippedSourcePaths(): string[] {
  return shippedSourceFiles(path.join(ROOT, "src"))
    .map((absolute) => path.relative(ROOT, absolute).split(path.sep).join("/"))
    .sort();
}

const includePatterns = configuredIncludePatterns();
const sourcePaths = shippedSourcePaths();

function isInScope(relativePath: string): boolean {
  return includePatterns.some((pattern) => path.posix.matchesGlob(relativePath, pattern));
}

describe("vitest coverage scope vs. the source tree on disk", () => {
  it("discovers the shipped source tree and is not blind to any of it", () => {
    // Without a floor, a walk that returned nothing would make every
    // assertion below vacuously true: no files, no files out of scope.
    expect(
      sourcePaths.length,
      "the source walk found almost nothing; it is blind to the tree it is supposed to measure"
    ).toBeGreaterThanOrEqual(60);

    for (const anchor of REQUIRED_IN_SCOPE) {
      expect(
        sourcePaths,
        `the walk did not find ${anchor}; either it is blind to that directory or the file ` +
          `moved, and both need a deliberate answer`
      ).toContain(anchor);
    }

    // The walk must not hand test files to the coverage config: a report that
    // measures its own suites flatters itself.
    expect(sourcePaths.filter((file) => /__tests__|\.test\.tsx?$/.test(file))).toEqual([]);
  });

  it("configures a non-empty coverage scope in which every pattern matches real files", () => {
    expect(
      includePatterns,
      "vitest.config.ts configures no coverage.include patterns at all, so this guard would " +
        "have nothing to check and coverage would silently fall back to its default scope"
    ).not.toEqual([]);

    const deadPatterns = includePatterns.filter(
      (pattern) => !sourcePaths.some((file) => path.posix.matchesGlob(file, pattern))
    );

    expect(
      deadPatterns,
      "these coverage.include patterns match no file that ships, so they measure nothing"
    ).toEqual([]);
  });

  it("puts every shipped source module inside the coverage scope", () => {
    const unmeasured = sourcePaths.filter((file) => !isInScope(file));

    expect(
      unmeasured,
      `${unmeasured.length} shipped module(s) are outside coverage.include ` +
        `(${includePatterns.join(", ")}), so they are absent from the report rather than ` +
        `reported at 0%: ${unmeasured.slice(0, 8).join(", ")}`
    ).toEqual([]);
  });

  it("keeps the UI layer specifically in scope, by name", () => {
    // Deliberately not derived from the walk. The check above compares two
    // sets, and two sets that both went blind agree with each other; these are
    // absolute expected values that no amount of blindness satisfies.
    for (const file of REQUIRED_IN_SCOPE) {
      expect(
        isInScope(file),
        `${file} is not matched by any coverage.include pattern (${includePatterns.join(", ")})`
      ).toBe(true);
    }
  });
});
