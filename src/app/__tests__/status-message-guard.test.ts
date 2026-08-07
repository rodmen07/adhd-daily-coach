/**
 * A page must not spell an error alert inline.
 *
 * Source A: every `page.tsx` under `src/app`, glob-discovered from the real
 *   tree (never hand-listed, so a fourteenth route is judged the moment it
 *   exists).
 * Source B: `src/app/components/status-message.tsx`, the primitive those pages
 *   delegate to, called directly so its semantics are asserted rather than
 *   assumed.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The same defect has now shipped twice on the same shape - a page-level status
 * spelled inline, each copy free to disagree with the others:
 *
 *   1. v0.15: `/focus` and `/pricing` offered sign-in and rendered no failure
 *      message at all. `auth-message-contract.test.ts` closed that surface.
 *   2. v0.21 found the rest of it (`docs/design/STATUS_VOCABULARY.md` section
 *      1, re-verified at source 2026-08-07): `/`'s configuration notice had no
 *      live region, and `/execute` had grown a second tone system a whole shade
 *      darker than the app's, including a neutral advice banner in no
 *      vocabulary at all.
 *
 * Two recurrences of "a hook returns a status a page may render however it
 * likes" is a missing check, not a missing reminder - the same reasoning that
 * produced `auth-message-contract` for the auth half, and `roadmap-guard-count`
 * for the roadmap's prose.
 *
 * WHAT IS GUARDED, AND WHAT DELIBERATELY IS NOT
 * ---------------------------------------------
 * Only `role="alert"` in a `page.tsx`. That is the half of the vocabulary whose
 * drift has actually bitten (silent or inconsistent ERRORS), and it is
 * mechanical enough to need no allowlist: after v0.21 PR1, zero page files
 * spell it. Errors must therefore reach a person through `StatusMessage`, or
 * through a component that wraps it - `role="alert"` stays legal inside
 * `src/app/components/`, where `reminder-settings.tsx`'s field-level validation
 * lives (out of scope by D5, and out of this scan by construction).
 *
 * Polite notes in page files stay unguarded on purpose: a page that shows a
 * calm note without a live region is a smaller defect than one that shows an
 * error nobody hears, and guarding it would need an allowlist for the
 * deliberate silences D5 lists (`/now`'s timer is `aria-live="off"` by design).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { shippedSourceFiles, withoutComments } from "@/__tests__/helpers/source-scan";
import { StatusMessage } from "@/app/components/status-message";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

const ALERT_ROLE = 'role="alert"';
const PRIMITIVE_IMPORT = "@/app/components/status-message";

/**
 * Anchors for the blindness control, named as FILES rather than as a directory.
 * A control that derives its expectation from the thing it checks is not a
 * control: if the discovery below went blind to nested routes, a loop over the
 * discovered list would shrink with it and still pass. These two are the exact
 * files that spelled `role="alert"` inline before this milestone, so a scan
 * that cannot see them is a scan whose clean result means nothing.
 */
const BLINDNESS_ANCHORS = ["src/app/page.tsx", "src/app/execute/page.tsx"];

function relative(absolute: string): string {
  return path.relative(ROOT, absolute).replace(/\\/g, "/");
}

const PAGE_FILES = shippedSourceFiles(APP_DIR)
  .map((absolute) => ({ file: relative(absolute), source: readFileSync(absolute, "utf-8") }))
  .filter(({ file }) => /^src\/app\/(?:.+\/)?page\.tsx$/.test(file));

/** True when this source spells the alert role itself, prose excluded. */
export function spellsAlertInline(source: string): boolean {
  return withoutComments(source).includes(ALERT_ROLE);
}

describe("page-level status speaks through the shared vocabulary", () => {
  it("discovers the page files it judges (zero-match hard failure)", () => {
    // Without this the suite passes loudest exactly when it is broken: an empty
    // file list means "no page spells role=alert" for the worst possible reason.
    expect(
      PAGE_FILES.length,
      "the walk found no page.tsx under src/app at all, so every result below is vacuous",
    ).toBeGreaterThan(0);
    expect(
      PAGE_FILES.length,
      "the walk found almost no routes under src/app; it is blind to nested directories",
    ).toBeGreaterThanOrEqual(10);

    for (const anchor of BLINDNESS_ANCHORS) {
      expect(
        PAGE_FILES.map(({ file }) => file),
        `the walk never reached ${anchor}, the file this guard was written for`,
      ).toContain(anchor);
    }
  });

  it("keeps the primitive worth delegating to", () => {
    // Source B. Forcing pages onto a primitive that lost its alert semantics
    // would replace a visible inconsistency with a silent one, so the guard
    // asserts the destination, not just the departure.
    const error = StatusMessage({ tone: "error", message: "something failed" });
    expect(error, "StatusMessage rendered nothing for a non-empty error").not.toBeNull();
    expect(error!.props.role, "the shared primitive lost role=\"alert\"").toBe("alert");
    expect(
      error!.props["aria-live"],
      "the shared primitive lost aria-live=\"assertive\", which is how a failure reaches a screen reader",
    ).toBe("assertive");

    for (const tone of ["success", "notice"] as const) {
      const quiet = StatusMessage({ tone, message: `a ${tone}` });
      expect(quiet!.props.role, `${tone} must not claim the alert role`).toBeUndefined();
      expect(quiet!.props["aria-live"], `${tone} must still reach a live region`).toBe("polite");
    }
  });

  it("leaves no page spelling the alert role inline", () => {
    const offenders = PAGE_FILES.filter(({ source }) => spellsAlertInline(source)).map(
      ({ file }) => file,
    );

    expect(
      offenders,
      `these pages spell ${ALERT_ROLE} themselves instead of delegating to the shared status ` +
        `vocabulary, so their wording, tone class and politeness are free to drift from every ` +
        `other surface: import { StatusMessage } from "${PRIMITIVE_IMPORT}" and pass tone="error"`,
    ).toEqual([]);
  });

  it("catches an inline alert and forgives prose (negative control)", () => {
    expect(
      spellsAlertInline(`<p className="text-sm text-rose-700" ${ALERT_ROLE} aria-live="assertive">x</p>`),
      "a real inline alert must be caught",
    ).toBe(true);
    expect(
      spellsAlertInline(`/** This page no longer spells ${ALERT_ROLE} itself. */`),
      "prose naming the attribute is documentation, not markup",
    ).toBe(false);
    expect(
      spellsAlertInline(`<StatusMessage tone="error" message={status.message} />`),
      "delegating to the primitive is the behaviour this guard wants",
    ).toBe(false);
  });
});
