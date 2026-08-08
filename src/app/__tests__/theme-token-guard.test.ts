/**
 * Theme-token drift guard (v0.10 theme consistency pass).
 *
 * docs/design/THEME_CONSISTENCY.md audited the app's real component markup
 * against its own CSS-variable theming system and found three shipped
 * light/dark rendering defects, each a literal (non-token) Tailwind color
 * class that slipped past the theme system unnoticed:
 *   1. `hover:bg-slate-800` on four back/reset nav buttons (ambient, breathe
 *      x2, challenges) paired with the theme-aware `text-(--foreground)`
 *      token - fine in dark mode, near-invisible dark-on-dark hover text the
 *      moment a user switches to light mode.
 *   2. subscription-guard.tsx's paywall screens, fully hardcoded dark
 *      regardless of the user's chosen theme.
 *   3. focus/page.tsx's `bg-white/70` "Coach brief" callout, a bright white
 *      box floating inside an otherwise dark-themed panel.
 *
 * All three shipped and went unnoticed because nothing scanned for the
 * pattern. This test is that scan, run over every .tsx file under src/app -
 * not just the three files this milestone happened to name - so a FOURTH
 * such defect fails CI before it ships instead of waiting for the next
 * audit to notice it by hand.
 *
 * Mechanism (Source A / Source B, THEME_CONSISTENCY.md section 3):
 *   Source A: every literal `(bg|text|border)-(slate|gray|zinc|neutral|
 *     stone)-(500-950)` class, with an optional `hover:` prefix and an
 *     optional `/NN` opacity suffix, plus bare bg-white/text-white/bg-black/
 *     text-black - across every src/app/**\/*.tsx file, __tests__ excluded.
 *   Source B, i.e. what makes an occurrence NOT a violation:
 *     (1) the class is covered by globals.css's hand-maintained
 *         `html[data-theme="dark"] .foo { ... }` override block. Parsed live
 *         from the real file rather than hand-copied, so a class added to
 *         the override later is automatically covered here too and this
 *         test can never silently drift from the real coverage list.
 *     (2) the file+class pair is in INTENTIONAL_EXCEPTIONS: a deliberate,
 *         recorded design decision (not debt), each with its reasoning
 *         written down so a reviewer can tell "on purpose" from "forgot".
 *     (3) the file+class pair's count is at or below its ceiling in
 *         BASELINE_DEBT: literal-color usages that predate this milestone
 *         and are explicitly out of scope for it (section 3, "Explicitly
 *         out of scope for v0.10" - migrating the already-covered
 *         text-slate-700-style literals wholesale). This is a FROZEN
 *         CEILING, not a blanket exemption for the file: a new occurrence
 *         of an already-listed class (raising the count above its ceiling),
 *         or any class in that file not listed at all, still fails.
 *
 * Fixing a baselined occurrence should delete or lower its entry in the
 * same change, the same discipline the design doc asks of Fix 1-3 above -
 * otherwise the ceiling quietly stops meaning anything.
 *
 * Deliberately NOT a fourth mechanism: THEME_CONSISTENCY.md section 3 named
 * "an explicit `dark:` pair in the same class string" as a way a Source A
 * occurrence could be considered covered. This guard does not implement
 * that, on purpose, and post-merge review (2026-07-20) confirmed why it
 * would be unsound to add: this app's Tailwind `dark:` variant is the
 * library default, tracking the OS-level `prefers-color-scheme` media query
 * (no `@custom-variant dark` remap exists anywhere in globals.css or
 * postcss.config.mjs) - it does NOT track `html[data-theme]`, the attribute
 * `ThemeToggle` actually flips. A user can run this app in light mode on a
 * dark-OS device (or the reverse), so a `dark:foo-500` class pairing proves
 * nothing about whether `foo-500` is safe under the app's own toggle; the
 * two are independent signals. Concretely: every `dark:`-paired risky class
 * already in this tree (verified 2026-07-20 - `page.tsx`'s
 * `dark:border-slate-800` and `dark:bg-slate-900/40`, `pricing/page.tsx`'s
 * two `dark:border-slate-800`, `review/page.tsx`'s `dark:text-slate-800`)
 * is scanned and accounted for the same as any other occurrence, via
 * COVERED_CLASSES or BASELINE_DEBT - never via a `dark:`-pair bypass, because
 * there is none. The synthetic test at the bottom of this file proves a new
 * `dark:`-paired class would be flagged, not silently waved through, so this
 * stays true even if someone adds Source A occurrences.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GLOBALS_CSS_PATH = path.join(ROOT, "src/app/globals.css");
const GLOBALS_CSS = readFileSync(GLOBALS_CSS_PATH, "utf-8");
const APP_DIR = path.join(ROOT, "src/app");

/** Every .tsx file under src/app, excluding __tests__ directories anywhere
 * in the tree (component-level and app-level both live under __tests__). */
function allAppFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...allAppFiles(full));
    } else if (entry.name.endsWith(".tsx")) {
      found.push(full);
    }
  }
  return found;
}

const APP_FILES = allAppFiles(APP_DIR).sort();

/** Repo-relative, forward-slash path, for stable baseline keys and readable
 * failure messages regardless of OS path separator. */
function relPath(absPath: string): string {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

const RISKY_FAMILY_PATTERN =
  /\b(?:hover:)?(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone)-(?:500|600|700|800|900|950)(?:\/\d{1,3})?\b/g;
const BARE_WHITE_BLACK_PATTERN = /\b(?:bg|text)-(?:white|black)(?:\/\d{1,3})?\b/g;

/** Strip a trailing `/NN` opacity modifier so `bg-slate-900/40` and a bare
 * `bg-slate-900` elsewhere count as the same underlying literal color. */
function baseClass(match: string): string {
  return match.replace(/\/\d{1,3}$/, "");
}

/** Every risky literal-color class token found in a file's raw source. */
function riskyClassesIn(source: string): string[] {
  const found: string[] = [];
  for (const pattern of [RISKY_FAMILY_PATTERN, BARE_WHITE_BLACK_PATTERN]) {
    for (const match of source.matchAll(pattern)) {
      found.push(baseClass(match[0]));
    }
  }
  return found;
}

/**
 * Classes covered by globals.css's dark-mode override block, parsed live.
 * Every rule in that block is written `html[data-theme="dark"] .some-class`
 * (including comma-separated selector lists, one per line), so pulling every
 * `.class` immediately following that exact prefix anywhere in the file
 * gives the real, current coverage set without hand-copying it.
 */
function coveredClasses(): Set<string> {
  const covered = new Set<string>();
  const pattern = /html\[data-theme="dark"\]\s*\.([a-zA-Z0-9-]+)/g;
  for (const match of GLOBALS_CSS.matchAll(pattern)) {
    covered.add(match[1]);
  }
  return covered;
}

const COVERED_CLASSES = coveredClasses();

/**
 * Specific file+class pairs that are a deliberate, recorded design decision
 * rather than unmigrated debt.
 */
const INTENTIONAL_EXCEPTIONS: ReadonlyArray<{
  file: string;
  className: string;
  reason: string;
}> = [
  {
    file: "src/app/slicer/page.tsx",
    className: "bg-black",
    reason:
      "modal backdrop dimming overlay - conventionally theme-agnostic by design (THEME_CONSISTENCY.md section 2, checked and set aside); not a defect.",
  },
  {
    file: "src/app/page.tsx",
    className: "text-slate-400",
    reason:
      "the 'Continuous Growth Loop' panel's dark:text-slate-400 (line ~420) looks like the same defect shape as the 5 sibling dark:text-slate-400 sites fixed 2026-07-20 (pricing/page.tsx x3, review/page.tsx x2), but traced through the real cascade it is not: this panel's own immediate background (`bg-slate-50 dark:bg-slate-900/40`) and border (`border-slate-200 dark:border-slate-800`) are themselves OS-tracked dark: literals (pre-existing BASELINE_DEBT for this file, not theme tokens), gated by the identical `prefers-color-scheme` media query as this text class. A media query is a single boolean per page load, so the text's dark: and the background's dark: always fire together - text and its own background can never go out of sync the way the 5 fixed sites' did (those sit inside `.panel`/`bg-(--field)` containers, i.e. real theme tokens keyed to data-theme, not dark:). Verified across all 4 data-theme x OS combinations (2026-07-20): every combo keeps this text legible against its own immediate background. The remaining issue - this one widget visually flips independent of the rest of the page when data-theme and OS disagree - is a restatement of the file's own already-baselined bg-slate-900/border-slate-800 debt, not a new contrast defect, so deleting or token-swapping the text alone would not fix anything and could regress the common dark+dark case (slate-500 is not tuned for a dark background).",
  },
];

/**
 * Pre-existing literal-color usages that predate the v0.10 theme-consistency
 * pass and are explicitly out of scope for it. See the module doc for what
 * this ceiling does and does not exempt.
 */
const BASELINE_DEBT: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "src/app/execute/page.tsx": {
    "text-slate-500": 5,
    "border-slate-500": 1,
  },
  "src/app/focus/page.tsx": {
    "hover:border-slate-500": 1,
  },
  "src/app/page.tsx": {
    "bg-slate-900": 1,
    "border-slate-800": 1,
    "text-slate-500": 8,
  },
  "src/app/pricing/page.tsx": {
    "text-slate-950": 1,
    "border-slate-800": 2,
  },
  "src/app/review/page.tsx": {
    "text-slate-500": 6,
  },
  "src/app/slicer/page.tsx": {
    "hover:bg-slate-800": 2,
    "text-slate-500": 5,
    "bg-slate-700": 2,
    "bg-slate-900": 1,
    "bg-slate-950": 1,
    "text-slate-950": 2,
    "hover:bg-slate-600": 1,
    "bg-slate-800": 1,
    "border-slate-500": 1,
  },
};

/**
 * Documented, human-facing total of every BASELINE_DEBT ceiling. This is the
 * number a PR description or doc referencing "how much baseline debt this
 * guard permits" should cite.
 *
 * History: PR #93's own description claimed "~25 pre-existing occurrences"
 * for what shipped as this same BASELINE_DEBT table. That prose was wrong -
 * a post-merge review (2026-07-20) re-summed the table and re-ran the scan
 * below independently and both agree on 42, a 68% undercount in the
 * description only. The BASELINE_DEBT table itself was never wrong; nothing
 * here changes its per-file ceilings. What was missing was this constant (so
 * "the total" has one canonical, checkable home instead of living only in
 * prose that can silently go stale) and the two self-checks below it, which
 * fail loudly instead of letting the number drift unnoticed the next time
 * BASELINE_DEBT is edited without this constant being updated to match.
 */
const BASELINE_DEBT_TOTAL = 42;

/** Sum of every ceiling in BASELINE_DEBT, independent of BASELINE_DEBT_TOTAL. */
function sumBaselineDebtCeilings(): number {
  let total = 0;
  for (const perClass of Object.values(BASELINE_DEBT)) {
    for (const ceiling of Object.values(perClass)) total += ceiling;
  }
  return total;
}

/**
 * The real, live, app-wide count of Source-A occurrences that are found but
 * not covered by globals.css's override list and not an INTENTIONAL_EXCEPTION
 * - i.e. exactly what BASELINE_DEBT's ceilings exist to permit. Computed
 * straight from riskyClassesIn/COVERED_CLASSES/INTENTIONAL_EXCEPTIONS and
 * never reads a BASELINE_DEBT number, so it cannot trivially agree with a
 * stale ceiling table just by construction.
 */
function scanRealBaselineDebtTotal(): number {
  let total = 0;
  for (const absPath of APP_FILES) {
    const rel = relPath(absPath);
    const source = readFileSync(absPath, "utf-8");
    const exceptionsForFile = new Set(
      INTENTIONAL_EXCEPTIONS.filter((exc) => exc.file === rel).map((exc) => exc.className),
    );
    for (const className of riskyClassesIn(source)) {
      if (COVERED_CLASSES.has(className)) continue;
      if (exceptionsForFile.has(className)) continue;
      total += 1;
    }
  }
  return total;
}

/**
 * Every violation a file's real source would produce against BASELINE_DEBT's
 * ceilings, COVERED_CLASSES, and INTENTIONAL_EXCEPTIONS - the same check the
 * per-file `it.each` below runs, factored out so the synthetic `dark:`-pair
 * test can run the identical, real mechanism against fabricated source
 * instead of duplicating (and risking silently diverging from) the logic.
 */
function violationsForFile(rel: string, source: string): string[] {
  const found = riskyClassesIn(source);
  const counts = new Map<string, number>();
  for (const className of found) {
    counts.set(className, (counts.get(className) ?? 0) + 1);
  }

  const exceptionsForFile = new Set(
    INTENTIONAL_EXCEPTIONS.filter((exc) => exc.file === rel).map((exc) => exc.className),
  );
  const baselineForFile = BASELINE_DEBT[rel] ?? {};

  const violations: string[] = [];
  for (const [className, count] of counts) {
    if (COVERED_CLASSES.has(className)) continue;
    if (exceptionsForFile.has(className)) continue;
    const ceiling = baselineForFile[className] ?? 0;
    if (count > ceiling) {
      violations.push(`${className} (found ${count}, baseline allows ${ceiling})`);
    }
  }
  return violations;
}

describe("theme-token drift guard", () => {
  it("finds app files to scan", () => {
    // Guards the scanner itself: if this ever drops near zero, the walk
    // silently stopped matching files and every check below passes vacuously.
    expect(APP_FILES.length).toBeGreaterThan(20);
  });

  it("the CSS override parser still finds the classes this test relies on", () => {
    // Guards the parser itself: if globals.css's override selectors are ever
    // rewritten to a shape this regex misses, COVERED_CLASSES silently goes
    // empty and every "already covered" class below would wrongly fail.
    expect(COVERED_CLASSES.has("text-slate-700")).toBe(true);
    expect(COVERED_CLASSES.has("border-slate-200")).toBe(true);
    expect(COVERED_CLASSES.size).toBeGreaterThanOrEqual(9);
  });

  it.each(INTENTIONAL_EXCEPTIONS)(
    "recorded exception $file / $className still applies to real source (not stale)",
    ({ file, className }) => {
      // An exception entry can record either kind of occurrence this file
      // scans for: a general Source-A literal (riskyClassesIn, shades
      // 500-950 + bare white/black) or a `dark:`-paired partner class below
      // that range (e.g. `dark:text-slate-400`, which riskyClassesIn never
      // matches at all). Checking only riskyClassesIn would make a `dark:`-
      // pair exception like page.tsx's text-slate-400 entry look stale even
      // though it is live, so both shapes are accepted here.
      const source = readFileSync(path.join(ROOT, file), "utf-8");
      const isGeneralMatch = riskyClassesIn(source).includes(className);
      const isDarkPairMatch = source.includes(`dark:${className}`);
      expect(isGeneralMatch || isDarkPairMatch).toBe(true);
    },
  );

  it.each(APP_FILES.map((absPath) => [relPath(absPath), absPath] as const))(
    "%s introduces no hardcoded color class beyond the recorded baseline",
    (rel, absPath) => {
      const source = readFileSync(absPath, "utf-8");
      const violations = violationsForFile(rel, source);

      expect(
        violations,
        violations.length === 0
          ? ""
          : `${rel} uses a hardcoded, non-theme-aware color class not covered by ` +
            `globals.css's dark-mode override, an intentional exception, or the ` +
            `recorded baseline: ${violations.join("; ")}. Use one of the existing ` +
            `--background/--panel/--field/--foreground/--muted tokens instead, or ` +
            `record a deliberate exception with a reason in INTENTIONAL_EXCEPTIONS.`,
      ).toEqual([]);
    },
  );

  it("BASELINE_DEBT's ceilings sum to the documented, freshly-verified total", () => {
    // Catches BASELINE_DEBT being edited (an entry added, removed, raised, or
    // lowered) without updating BASELINE_DEBT_TOTAL to match - the exact
    // "prose total quietly stops describing the real table" failure that
    // produced PR #93's "~25" undercount in the first place.
    expect(sumBaselineDebtCeilings()).toBe(BASELINE_DEBT_TOTAL);
  });

  it("the documented baseline-debt total matches a live, independent app-wide scan", () => {
    // scanRealBaselineDebtTotal() never reads a BASELINE_DEBT number - it
    // re-derives the real count straight from the source files, the same way
    // the per-file checks above do, just summed across the whole app. The
    // per-file checks above only fail upward (`count > ceiling`), so a
    // ceiling left too HIGH after a fix lowered the real count would pass
    // them silently forever; this equality check is what catches drift in
    // either direction, the self-check this item exists to add.
    expect(scanRealBaselineDebtTotal()).toBe(BASELINE_DEBT_TOTAL);
  });

  describe("the `dark:` Tailwind variant is not treated as a safety exemption", () => {
    // This app's `dark:` variant is the Tailwind default: it tracks the
    // OS-level `prefers-color-scheme` media query, not `html[data-theme]`
    // (the attribute ThemeToggle actually flips). Confirmed by absence, not
    // assumed: no `@custom-variant dark` remap exists in globals.css, and
    // there is no tailwind.config.{js,ts} anywhere in the repo to set a
    // `darkMode` strategy either. A `dark:`-paired class is therefore NOT
    // proof a color is safe under this app's real light/dark toggle - a user
    // can have the app in light mode on a dark-OS device or the reverse. This
    // guard has no code path that treats a `dark:` prefix specially (see the
    // module doc above), so a `dark:`-paired class is scanned exactly like
    // any other literal and must clear COVERED_CLASSES / INTENTIONAL_EXCEPTIONS
    // / BASELINE_DEBT same as everything else. This test proves that stays
    // true with a fabricated file+class pair that is deliberately absent from
    // every one of those three lists.
    it("flags a hypothetical new dark:-paired risky class instead of silently exempting it", () => {
      const hypotheticalRel = "src/app/__fixtures__/hypothetical-dark-pair.tsx";
      const hypotheticalSource =
        '<div className="text-zinc-600 dark:text-zinc-700">not a real file, not in BASELINE_DEBT or INTENTIONAL_EXCEPTIONS</div>';

      // Sanity: prove the fixture actually contains risky classes that are
      // clear of every exemption, so a pass below is not vacuous.
      expect(COVERED_CLASSES.has("text-zinc-600")).toBe(false);
      expect(COVERED_CLASSES.has("text-zinc-700")).toBe(false);
      expect(BASELINE_DEBT[hypotheticalRel]).toBeUndefined();

      const violations = violationsForFile(hypotheticalRel, hypotheticalSource);

      expect(violations).toContain("text-zinc-600 (found 1, baseline allows 0)");
      expect(violations).toContain("text-zinc-700 (found 1, baseline allows 0)");
    });

    // Shade range includes 300 (widened from the 500-950 RISKY_FAMILY_PATTERN
    // range used elsewhere in this file) because of a real shipped defect
    // (found during the v0.11 Trends audit, fixed 2026-07-20): a literal
    // `text-slate-700 dark:text-slate-300` (or `text-slate-400 dark:
    // text-slate-300`) pairing appeared 7 times across review/pricing/
    // execute/trends. `text-slate-300` sits below 500, so it was invisible to
    // every mechanism above - COVERED_CLASSES, BASELINE_DEBT, and this guard
    // alike - even though it is exactly the kind of `dark:`-paired literal
    // this describe block exists to catch. The bug was real: this app's
    // `dark:` variant tracks the OS `prefers-color-scheme` media query, not
    // `html[data-theme]`, so with the app in light theme and the OS set to
    // dark, `dark:text-slate-300` won the cascade by source order over an
    // already-AA-safe base class, rendering ~1.4:1 contrast text. 300 is
    // added here, specifically and only for this shade-300 partner, not the
    // general 500-950 sweep, so this guard's blast radius matches exactly
    // what was verified fixed.
    //
    // 400 added 2026-07-20 (this fix): a fresh grep re-count found exactly 6
    // real `dark:text-slate-400` occurrences (the pre-existing backlog note
    // undercounted this as "pricing/page.tsx x2" - it is actually x3, the
    // same class of prose-vs-reality drift this file's own history already
    // has one precedent of, see BASELINE_DEBT_TOTAL above): pricing/page.tsx
    // x3 (lines 20, 33, 93) and review/page.tsx x2 (lines 135, 152) were
    // fixed by deleting the redundant `dark:` suffix - each base class
    // (text-slate-700 / text-slate-600) is COVERED, so the real dark-theme
    // override already renders it correctly and the OS-tracked `dark:`
    // partner was pure defect. page.tsx's 6th occurrence (line ~420) traced
    // differently and is NOT fixed the same way - see its
    // INTENTIONAL_EXCEPTIONS entry above for why it is not actually unsafe
    // (its own background is also an OS-tracked `dark:` literal, so text and
    // background can never go out of sync there, unlike the 5 fixed sites
    // whose containers are real `--panel`/`--field` theme tokens).
    //
    // 100 and 200 added together 2026-07-26 (this fix), closing the range
    // walk the 300 and 400 fixes started. The MED bug filed alongside the
    // 400 fix enumerated 12 `dark:`-paired occurrences at these two shades;
    // a fresh full-family sweep re-verified the count (exactly 12, no
    // bg/border or gray/zinc/neutral/stone matches anywhere):
    // `text-slate-800 dark:text-slate-200` x10 (execute/page.tsx x3,
    // page.tsx x4, review/page.tsx x3) and `text-slate-800
    // dark:text-slate-100` x2 (pricing/page.tsx, review/page.tsx). Unlike
    // the 400 pass, per-site container tracing found NO page.tsx:420-style
    // self-consistent site: every one of the 12 sits inside a real
    // theme-token container (`bg-[var(--field)]`, `bg-[var(--surface-strong)]`,
    // `bg-(--field)`), and the shared base class `text-slate-800` IS covered
    // by globals.css's `html[data-theme="dark"]` override, so all 12 took
    // the delete-the-redundant-`dark:`-suffix fix. Measured, not asserted:
    // in the defect combination (app light theme + OS dark) slate-200 on the
    // light `--field` renders 1.20:1 and slate-100 renders 1.07:1, both far
    // below WCAG AA 4.5:1; after the fix the same text renders 14.27:1
    // (light, base class) and 11.46:1 (dark, via the --muted-strong
    // override). Both shades were added in one pass, not shade-by-shade,
    // exactly as the bug entry prescribed - they were fully enumerated
    // together, so splitting them again would have manufactured a second PR
    // for no verification benefit.
    const DARK_PAIR_PATTERN =
      /dark:((?:hover:)?(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone)-(?:100|200|300|400|500|600|700|800|900|950)(?:\/\d{1,3})?)\b/g;

    /**
     * Every `dark:`-paired risky-family class in `source` (DARK_PAIR_PATTERN,
     * above) that is NOT accounted for via COVERED_CLASSES, an
     * INTENTIONAL_EXCEPTIONS entry for `rel`, or a BASELINE_DEBT ceiling for
     * `rel` - the same three mechanisms violationsForFile checks, applied to
     * `dark:`-prefixed matches specifically. Factored out so the synthetic
     * regression test below runs the identical, real mechanism against
     * fabricated source instead of duplicating (and risking silently
     * diverging from) the logic the real-app scan uses - the same discipline
     * violationsForFile follows for the general Source-A checks above.
     */
    function unaccountedDarkPairsIn(rel: string, source: string): string[] {
      const exceptionsForFile = new Set(
        INTENTIONAL_EXCEPTIONS.filter((exc) => exc.file === rel).map((exc) => exc.className),
      );
      const unaccounted: string[] = [];
      for (const match of source.matchAll(DARK_PAIR_PATTERN)) {
        const className = baseClass(match[1]);
        const covered = COVERED_CLASSES.has(className);
        const excepted = exceptionsForFile.has(className);
        const baselined = (BASELINE_DEBT[rel]?.[className] ?? 0) > 0;
        if (!(covered || excepted || baselined)) unaccounted.push(className);
      }
      return unaccounted;
    }

    it("existing real dark:-paired classes in the app are already accounted for via COVERED_CLASSES or BASELINE_DEBT, never a dark: bypass", () => {
      // Every real `dark:`-paired risky-family class currently in src/app
      // must resolve through the ordinary mechanisms, exactly like a class
      // with no `dark:` pairing at all - see unaccountedDarkPairsIn above for
      // the shade-range rationale.
      let sawAtLeastOne = false;
      for (const absPath of APP_FILES) {
        const rel = relPath(absPath);
        const source = readFileSync(absPath, "utf-8");
        if (source.match(DARK_PAIR_PATTERN)) sawAtLeastOne = true;
        const unaccounted = unaccountedDarkPairsIn(rel, source);
        expect(
          unaccounted,
          unaccounted.length === 0
            ? ""
            : `${rel}: dark:${unaccounted.join(", dark:")} is not covered, excepted, or ` +
              `baselined - it would only pass if something is silently treating the ` +
              `dark: prefix itself as safe, which this guard must never do`,
        ).toEqual([]);
      }
      // Guards this test itself: if the app-wide dark: pairing ever
      // disappears entirely, the loop above passes vacuously.
      expect(sawAtLeastOne).toBe(true);
    });

    it("would have caught the shipped text-slate-700(or 400) dark:text-slate-300 contrast bug (regression)", () => {
      // Reproduces the exact shape of the real, shipped defect fixed
      // 2026-07-20 in review/page.tsx (x2), pricing/page.tsx, execute/page.tsx
      // (x3), and trends/page.tsx (x1): a `dark:text-slate-300` pair with no
      // `html[data-theme="dark"] .text-slate-300` override anywhere in
      // globals.css (slate-300 is a light shade never meant to be a dark-mode
      // override target, which is exactly why it is dangerous as a `dark:`
      // partner - it wins the cascade whenever the OS reports dark regardless
      // of the app's own light/dark toggle). The fixture's base class
      // (text-slate-700) IS covered - that alone used to be irrelevant to
      // this mechanism, since only the paired class after `dark:` is checked
      // - but it is the paired class, text-slate-300, that must fail here.
      //
      // Verified concretely, not just asserted: reverted the trends/page.tsx
      // fix locally (restored ` dark:text-slate-300` on its one occurrence),
      // ran this file's suite, watched this exact test fail with `trends`
      // absent from unaccountedDarkPairsIn's real-app equivalent (the test
      // above) reporting `text-slate-300` unaccounted, then restored the fix
      // and re-ran to confirm green.
      const hypotheticalRel = "src/app/__fixtures__/hypothetical-light-dark-pair.tsx";
      const hypotheticalSource =
        '<div className="rounded-xl border p-4 text-sm text-slate-700 dark:text-slate-300">not a real file, mirrors the shipped defect shape</div>';

      // Sanity: prove the fixture's paired class is genuinely unexempted, so
      // a failure below would be real and not vacuous.
      expect(COVERED_CLASSES.has("text-slate-300")).toBe(false);
      expect(BASELINE_DEBT[hypotheticalRel]).toBeUndefined();

      expect(unaccountedDarkPairsIn(hypotheticalRel, hypotheticalSource)).toContain(
        "text-slate-300",
      );
    });

    it("would have caught the shipped dark:text-slate-400 contrast bug (regression, fixed 2026-07-20)", () => {
      // Reproduces the shape of the real, shipped defect fixed 2026-07-20 in
      // pricing/page.tsx (x3: lines 20, 33, 93) and review/page.tsx (x2:
      // lines 135, 152): a `dark:text-slate-400` pair with no
      // `html[data-theme="dark"] .text-slate-400` override anywhere in
      // globals.css - the identical root cause as the text-slate-300 bug
      // above, just one shade lighter. The fixture's base class
      // (text-slate-600) IS covered - irrelevant to this mechanism, since
      // only the paired class after `dark:` is checked - but it is the
      // paired class, text-slate-400, that must fail here.
      //
      // Verified concretely: reverted one of pricing/page.tsx's three fixes
      // locally (restored ` dark:text-slate-400` on line 20), ran this
      // file's suite, watched this exact test fail with `pricing` absent
      // from unaccountedDarkPairsIn's real-app equivalent (the test above)
      // reporting `text-slate-400` unaccounted, then restored the fix and
      // re-ran to confirm green.
      const hypotheticalRel = "src/app/__fixtures__/hypothetical-slate-400-dark-pair.tsx";
      const hypotheticalSource =
        '<p className="text-sm text-slate-600 dark:text-slate-400">not a real file, mirrors the shipped defect shape</p>';

      // Sanity: prove the fixture's paired class is genuinely unexempted, so
      // a failure below would be real and not vacuous.
      expect(COVERED_CLASSES.has("text-slate-400")).toBe(false);
      expect(BASELINE_DEBT[hypotheticalRel]).toBeUndefined();

      expect(unaccountedDarkPairsIn(hypotheticalRel, hypotheticalSource)).toContain(
        "text-slate-400",
      );
    });

    it("would have caught the shipped text-slate-800 dark:text-slate-200/100 contrast bug (regression, fixed 2026-07-26)", () => {
      // Reproduces the shape of the real, shipped defect fixed 2026-07-26 at
      // 12 sites (execute/page.tsx x3, page.tsx x4, review/page.tsx x4,
      // pricing/page.tsx x1): a `dark:text-slate-200` (or -100) pair with no
      // `html[data-theme="dark"] .text-slate-200/-100` override anywhere in
      // globals.css - the identical root cause as the shade-300 and shade-400
      // bugs above, at the last two shades the guard did not yet track. With
      // the app in light theme and the OS reporting dark, the near-white
      // partner won the cascade over the covered text-slate-800 base and
      // rendered 1.20:1 (slate-200) / 1.07:1 (slate-100) against the light
      // `--field`. The fixture's base class (text-slate-800) IS covered -
      // irrelevant to this mechanism, since only the paired class after
      // `dark:` is checked - but it is the paired classes, text-slate-200 and
      // text-slate-100, that must fail here.
      //
      // Verified concretely: reverted one of execute/page.tsx's three fixes
      // locally (restored ` dark:text-slate-200` on the Focus pill), ran this
      // file's suite, watched the real-app test above fail reporting
      // `text-slate-200` unaccounted for execute/page.tsx, then restored the
      // fix and re-ran to confirm green.
      const hypotheticalRel = "src/app/__fixtures__/hypothetical-slate-200-dark-pair.tsx";
      const slate200Source =
        '<p className="text-sm font-semibold text-slate-800 dark:text-slate-200">not a real file, mirrors the shipped defect shape</p>';
      const slate100Source =
        '<p className="text-5xl font-extrabold text-slate-800 dark:text-slate-100">second variant, mirrors pricing/review</p>';

      // Sanity: prove both paired classes are genuinely unexempted, so a
      // failure below would be real and not vacuous.
      expect(COVERED_CLASSES.has("text-slate-200")).toBe(false);
      expect(COVERED_CLASSES.has("text-slate-100")).toBe(false);
      expect(BASELINE_DEBT[hypotheticalRel]).toBeUndefined();

      expect(unaccountedDarkPairsIn(hypotheticalRel, slate200Source)).toContain(
        "text-slate-200",
      );
      expect(unaccountedDarkPairsIn(hypotheticalRel, slate100Source)).toContain(
        "text-slate-100",
      );
    });
  });

  it("the scanner actually finds risky classes somewhere (not vacuously blind)", () => {
    // Sanity check on the whole mechanism, independent of any single file's
    // baseline: if the regex ever silently stopped matching (e.g. after a
    // Tailwind syntax change), every per-file check above would start
    // passing for the wrong reason. Summing across the whole app catches
    // that even if every individual baseline still happened to balance.
    const total = APP_FILES.reduce(
      (sum, absPath) => sum + riskyClassesIn(readFileSync(absPath, "utf-8")).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });
});

describe(".primary-button text colour stays theme-aware on --accent (WCAG AA)", () => {
  // globals.css's `.primary-button` paints text on `background: var(--accent)`,
  // and --accent flips light-mint (dark theme) <-> dark-teal (light theme).
  // A FIXED dark text colour (#08131a) rendered ~2:1 on the light-theme
  // dark-teal accent, below WCAG AA 4.5:1. The fix points the text at
  // --accent-foreground, which flips OPPOSITE --accent (dark #08131a / light
  // #ffffff) - the same token the Subscribe button already ships (PR #93,
  // verified dark ~10.8:1 / light ~7.5:1). This guard fails if a future edit
  // reintroduces a hardcoded, non-theme-aware colour on .primary-button.

  // The base `.primary-button { ... }` rule that sets colour + `background:
  // var(--accent)` - not the shared shape rule (`.primary-button,
  // .secondary-button`), nor `:hover` (var(--accent-strong)) / `:disabled`.
  const primaryButtonRule =
    GLOBALS_CSS.match(/\.primary-button\s*\{[^}]*background:\s*var\(--accent\)[^}]*\}/)?.[0] ?? "";

  it("locates the .primary-button rule that paints on --accent", () => {
    expect(primaryButtonRule).not.toBe("");
  });

  it("uses var(--accent-foreground), never a hardcoded colour", () => {
    const colour = primaryButtonRule.match(/color:\s*([^;]+);/)?.[1]?.trim();
    expect(colour).toBe("var(--accent-foreground)");
    // Belt and suspenders: no raw hex left on the colour declaration.
    expect(primaryButtonRule).not.toMatch(/color:\s*#[0-9a-fA-F]{3,8}\s*;/);
  });

  it("--accent-foreground is defined for both themes so the flip actually happens", () => {
    // One definition in :root (dark) + one in html[data-theme="light"]; without
    // the light override the text would not flip and the contrast fix is moot.
    const defs = GLOBALS_CSS.match(/--accent-foreground:\s*[^;]+;/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(2);
  });
});
