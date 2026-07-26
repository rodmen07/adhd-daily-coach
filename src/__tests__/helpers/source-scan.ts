/**
 * Shared plumbing for the guards that read the real source tree
 * (`static-export-surface.test.ts`, `onboarding-storage-contract.test.ts`).
 *
 * Both need the same two things: the list of files that actually ship, and a
 * way to ignore comments so a module doc may NAME the thing being guarded
 * without tripping its own guard. Keeping one copy here is the same rule those
 * guards enforce on the rest of the repo.
 *
 * This lives under `src/__tests__/` on purpose: the walk below skips any
 * `__tests__` directory, so the helper cannot accidentally scan itself, and
 * coverage (`src/lib/**`) never counts it as product code.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * Strip comments before scanning. A module's own doc comment is allowed to
 * name a forbidden import or a guarded string literal, and prose must never be
 * read as code. The `[^:]` guard keeps `https://` inside a string from being
 * treated as the start of a line comment.
 */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every shipped `.ts`/`.tsx` file under `dir`, excluding tests. */
export function shippedSourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        continue;
      }
      found.push(...shippedSourceFiles(absolute));
      continue;
    }

    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      continue;
    }

    found.push(absolute);
  }

  return found;
}
