/**
 * Guards the two properties that make this app a purely client-side static
 * export. Both are premises the rest of the repo already relies on, and
 * neither had anything checking it until this file.
 *
 * The premise itself is read live from `next.config.ts` (`output: "export"`):
 * there is no server, no route handler, and no Node runtime in production, so
 * every module under `src/` that is not a test runs in a browser tab.
 *
 * Property 1, no server surface. A module importing a Node built-in cannot
 * run in that browser, so at best it is dead weight and at worst it is a
 * second implementation someone wires up by mistake. Not hypothetical here:
 * `src/lib/checkins.ts` kept a `node:fs` check-in store writing
 * `.data/checkins.json` under `process.cwd()` long after the static-export
 * decision, and it exported `addCheckin` and `getWeeklySummary` - the same
 * two names the live `browser-checkins.ts` exports - so a grep for either
 * name found two implementations of which only one could ever run.
 *
 * Property 2, no unused production dependency. `src/lib/mailer.ts` was the
 * only importer of `nodemailer`, so a package the app could never load still
 * sat in `dependencies`, inside the surface `npm audit --audit-level=high`
 * scans on every PR (ci.yml's blocking step). A fresh advisory against such a
 * package still wedges the gate, which is this repo's single most frequent CI
 * incident (fixed four times: PRs #99, #101, #102, #107).
 *
 * Both modules were deleted in the PR that added this file. These assertions
 * are what stops the class from growing back silently, which a one-time
 * cleanup would not.
 *
 * Scope note: this checks `dependencies` only, never `devDependencies`. Dev
 * tooling (eslint, vitest, tailwind, type packages) is legitimately used by
 * config files and by the test runner rather than by imported source, so the
 * same rule there would be noise.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { shippedSourceFiles, withoutComments } from "@/__tests__/helpers/source-scan";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

/**
 * Production dependencies that are deliberately not imported by our own
 * source. Every entry carries a reason, and both staleness directions are
 * asserted below, so this list cannot quietly become a place to hide a dead
 * dependency.
 */
const RUNTIME_ONLY_DEPENDENCIES: Record<string, string> = {
  "react-dom": "React's DOM renderer. Next.js mounts the tree with it; app code imports `react` and never `react-dom` directly.",
};

/**
 * Bare Node built-in specifiers. The `node:` prefix is caught by prefix, so
 * this set only has to cover the legacy unprefixed spellings.
 */
const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "readline",
  "stream",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]);

/** Every module specifier a file imports: static, side-effect, dynamic, require. */
export function importSpecifiers(source: string): string[] {
  const matches = withoutComments(source).matchAll(
    /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g,
  );
  return [...matches].map((match) => match[1]);
}

/** The Node built-in a specifier names, or null when it names something else. */
export function nodeBuiltinFromSpecifier(specifier: string): string | null {
  if (specifier.startsWith("node:")) {
    return specifier;
  }
  return NODE_BUILTINS.has(specifier) ? specifier : null;
}

/**
 * The npm package a specifier resolves to, or null for anything that is not a
 * package: relative paths, the tsconfig `@/*` alias onto `./src/*`, and Node
 * built-ins (handled separately so they are reported as a server surface
 * rather than as a missing dependency).
 */
export function packageNameFromSpecifier(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/")) {
    return null;
  }
  if (nodeBuiltinFromSpecifier(specifier)) {
    return null;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

const SHIPPED_FILES = shippedSourceFiles(SRC_DIR);

const IMPORTS_BY_FILE = SHIPPED_FILES.map((absolute) => ({
  file: path.relative(ROOT, absolute).replace(/\\/g, "/"),
  specifiers: importSpecifiers(readFileSync(absolute, "utf-8")),
}));

const IMPORTED_PACKAGES = new Set(
  IMPORTS_BY_FILE.flatMap(({ specifiers }) =>
    specifiers.map(packageNameFromSpecifier).filter((name): name is string => name !== null),
  ),
);

const PRODUCTION_DEPENDENCIES = Object.keys(
  (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")) as {
    dependencies?: Record<string, string>;
  }).dependencies ?? {},
);

describe("static-export surface", () => {
  it("still rests on a real static export, so the rules below still apply", () => {
    const config = readFileSync(path.join(ROOT, "next.config.ts"), "utf-8");

    expect(
      /output:\s*"export"/.test(config),
      "next.config.ts no longer sets output: \"export\", so this app may have a server runtime again - revisit both rules in this file rather than deleting the failures",
    ).toBe(true);
  });

  it("reads the app's real source, so a blind scan cannot report clean", () => {
    expect(SHIPPED_FILES.length, "the file walk found almost nothing under src/").toBeGreaterThan(30);
    expect(
      IMPORTS_BY_FILE.some(({ file }) => file === "src/app/layout.tsx"),
      "the file walk never reached src/app/layout.tsx, so its silence means nothing",
    ).toBe(true);
    expect(IMPORTED_PACKAGES.has("next"), "no shipped file appears to import next, so the specifier scan is broken").toBe(
      true,
    );
  });

  it("ships no module that imports a Node built-in", () => {
    const offenders = IMPORTS_BY_FILE.flatMap(({ file, specifiers }) =>
      specifiers
        .map(nodeBuiltinFromSpecifier)
        .filter((builtin): builtin is string => builtin !== null)
        .map((builtin) => `${file} imports ${builtin}`),
    );

    expect(
      offenders,
      "a browser-only static export has no Node runtime, so these imports can never execute in production",
    ).toEqual([]);
  });

  it("declares no production dependency that nothing imports", () => {
    const unused = PRODUCTION_DEPENDENCIES.filter(
      (name) => !IMPORTED_PACKAGES.has(name) && !(name in RUNTIME_ONLY_DEPENDENCIES),
    );

    expect(
      unused,
      "these packages sit in dependencies with no importer, so npm audit still gates every PR on code the app cannot load",
    ).toEqual([]);
  });

  it("keeps the runtime-only allowlist honest in both directions", () => {
    const allowlisted = Object.keys(RUNTIME_ONLY_DEPENDENCIES);

    expect(
      allowlisted.filter((name) => !PRODUCTION_DEPENDENCIES.includes(name)),
      "allowlisted packages are no longer dependencies at all, so their entries are stale",
    ).toEqual([]);
    expect(
      allowlisted.filter((name) => IMPORTED_PACKAGES.has(name)),
      "these packages are imported by real source now, so they no longer need an allowlist entry",
    ).toEqual([]);
    expect(
      allowlisted.filter((name) => RUNTIME_ONLY_DEPENDENCIES[name].trim().length === 0),
      "an allowlist entry with no reason is indistinguishable from a dead dependency",
    ).toEqual([]);
  });

  it("recognises the imports it exists to catch (negative control)", () => {
    const synthetic = [
      '// import { lie } from "node:vm";',
      '/** Doc comment naming node:fs and "nodemailer" on purpose. */',
      'import { promises as fs } from "node:fs";',
      'import nodemailer from "nodemailer";',
      'import { z } from "zod";',
      'import { FOCUS_AREAS } from "@/lib/plan";',
      'import sibling from "./sibling";',
      'const lazy = await import("firebase/firestore");',
    ].join("\n");

    const specifiers = importSpecifiers(synthetic);

    expect(specifiers, "comments must never be scanned as imports").toEqual([
      "node:fs",
      "nodemailer",
      "zod",
      "@/lib/plan",
      "./sibling",
      "firebase/firestore",
    ]);
    expect(specifiers.map(nodeBuiltinFromSpecifier).filter(Boolean)).toEqual(["node:fs"]);
    expect(specifiers.map(packageNameFromSpecifier).filter(Boolean)).toEqual([
      "nodemailer",
      "zod",
      "firebase",
    ]);
    expect(nodeBuiltinFromSpecifier("path"), "the legacy unprefixed spelling must count too").toBe("path");
  });
});
