/**
 * Rendered-DOM theme-token assertions, shared by the page suites that drive a
 * conditional branch and then read what a browser would actually be handed.
 * `css-var-syntax-guard.test.ts` bans the broken Tailwind v3 CSS-variable
 * spelling in SOURCE; these helpers are the other half of that guard: a
 * conditional branch's classes do not exist in the DOM until the branch
 * renders, so only a driven render can prove the branch emits paintable
 * classes. `ambient-page.test.tsx` established the pattern (PR #165) and
 * keeps its own inline copy; the consumers of this module are the suites
 * that joined it - `grep -rl "helpers/rendered-theme" src/` names them.
 *
 * This lives under `src/__tests__/helpers/` on purpose, like
 * `source-scan.ts`: every source-scanning guard skips `__tests__`
 * directories, vitest's default `coverage.exclude` keeps it out of the
 * coverage report, and `roadmap-guard-count.test.ts` discovers only
 * `.test.ts` files directly under its two GUARD_DIRS, so a helper here can
 * neither be scanned as app source nor counted as a guard suite.
 *
 * Both regexes are built from strings so the broken spelling never appears
 * literally in this file (the source guard scans `src/`, not `__tests__`,
 * but the construction keeps that true even if its walk ever widens).
 */

/** Tailwind v3 CSS-variable utility, e.g. `bg-[--panel]` - compiles to an
 * invalid declaration under v4 that a browser silently drops. */
export const BROKEN_FORM = new RegExp(`[a-zA-Z-]+-\\[(--[a-zA-Z0-9-]+)\\]`, "g");

/** Tailwind v4 CSS-variable utility, e.g. `bg-(--panel)` or
 * `shadow-(color:--accent)` - the paintable spelling. */
export const WORKING_FORM = new RegExp(
  `[a-zA-Z-]+-\\((?:color:)?--[a-zA-Z0-9-]+\\)`,
  "g",
);

/** Every class attribute in the rendered tree, joined for regex sweeps. */
export function renderedClassNames(container: HTMLElement): string {
  return [...container.querySelectorAll("[class]")]
    .map((element) => element.getAttribute("class") ?? "")
    .join(" ");
}

/** The CSS-variable token utilities on one element, both spellings, sorted -
 * for asserting a driven state actually changed what the element paints. */
export function tokenClasses(element: Element): string[] {
  const className = element.getAttribute("class") ?? "";
  return [
    ...(className.match(WORKING_FORM) ?? []),
    ...(className.match(BROKEN_FORM) ?? []),
  ].sort();
}
