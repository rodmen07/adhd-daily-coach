/**
 * v0.19 PR1 - the first-run panel is out of normal flow, and stays there.
 * (docs/design/PERF_PASS.md D1.)
 *
 * WHAT DEFECT THIS PINS
 * ---------------------
 * The entry route measured a Cumulative Layout Shift of 0.752 - roughly three
 * quarters of the viewport moving under the reader after first paint - and the
 * Lighthouse report named a single contributor for all of it:
 * `main#main-content > div.page-shell > div.mx-auto > section.panel` moving.
 * The cause is structural, not stylistic: the onboarding panel is deliberately
 * absent from the prerendered HTML (v0.15 PR2's hydration contract) and is
 * raised by a deferred client effect, so while it rendered as an IN-FLOW block
 * above `section.panel`, its arrival pushed the entire dashboard down.
 *
 * WHY THE ASSERTIONS ARE SPLIT ACROSS TWO SOURCES
 * -----------------------------------------------
 * jsdom does not load `globals.css` and computes no layout, so no DOM-only
 * assertion in this repo can observe "this element is out of flow". The
 * property is therefore pinned as the CONJUNCTION of two halves that are each
 * mechanically checkable, and reverting either half fails a test here:
 *
 *   1. the rendered tree puts the dialog inside `.first-run-overlay`
 *      (fails if the in-flow `<div className="mb-6">` wrapper comes back);
 *   2. `.first-run-overlay` really is `position: fixed; inset: 0` in the
 *      stylesheet (fails if the class is renamed, deleted, or softened back to
 *      static/relative flow).
 *
 * The end-to-end proof that the shift is gone is the `lighthouse` job's CLS
 * number on this PR, which is what the gate in `lighthouserc.cjs` then holds.
 *
 * The accessibility assertions are not decoration either: taking a panel out of
 * flow and floating it over the page turns it into a modal, and a modal that
 * does not move focus, cannot be dismissed from the keyboard, and lets Tab walk
 * the page behind it is a worse defect than the layout shift it replaced.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { Onboarding } from "@/app/components/onboarding";
import { FOCUS_AREAS, type FocusArea } from "@/lib/plan";

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: vi.fn(() => null),
  getFirebaseFirestore: vi.fn(() => null),
}));

const emptyByFocus: Record<FocusArea, { done: number; skipped: number }> = Object.fromEntries(
  FOCUS_AREAS.map((focusArea) => [focusArea, { done: 0, skipped: 0 }]),
) as Record<FocusArea, { done: number; skipped: number }>;

vi.mock("@/lib/browser-checkins", () => ({
  addCheckin: vi.fn(),
  getWeeklySummary: vi.fn(() => ({
    windowStart: "2026-06-21",
    windowEnd: "2026-06-27",
    total: 0,
    done: 0,
    skipped: 0,
    completionRate: 0,
    byFocus: emptyByFocus,
  })),
}));

const CSS_PATH = path.join(process.cwd(), "src/app/globals.css");

/** Line endings normalised: this repo is checked out with `core.autocrlf=true`
 *  on Windows and LF on the Linux runner, so both must read the same text. */
function readCss(): string {
  return readFileSync(CSS_PATH, "utf-8").replace(/\r\n/g, "\n");
}

/** The declaration block of a single top-level rule, by exact selector. Returns
 *  null when the selector is absent, which is the negative control: a renamed
 *  or deleted class must fail loudly rather than silently assert nothing. */
function ruleBody(css: string, selector: string): string | null {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) {
    return null;
  }
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return close === -1 ? null : css.slice(open + 1, close);
}

function focusableIn(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

describe("first-run overlay: out of flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    (window as unknown as { __ANIMATE_COUNTERS__?: boolean }).__ANIMATE_COUNTERS__ = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the first-run panel inside the overlay, not as a block above the dashboard", async () => {
    // A genuine first-time visitor: no stored preference record.
    render(<Home />);

    const dialog = await screen.findByTestId("onboarding-container");
    const overlay = screen.getByTestId("first-run-overlay");

    expect(overlay.contains(dialog)).toBe(true);

    // Blindness control: the dashboard really did render, so "the dialog is not
    // an in-flow sibling of it" is a statement about a page that exists.
    const panel = document.querySelector("section.panel");
    expect(panel, "the dashboard panel is missing, so this test proves nothing").not.toBeNull();

    // The overlay is the ONLY element between the column and the dialog. The
    // regression shape is an extra in-flow wrapper reappearing in that gap -
    // `<div className="mb-6">` is what used to be there - so anything other
    // than the class this file also pins as `position: fixed` fails here.
    expect(dialog.parentElement).toBe(overlay);
    expect(overlay.className.trim()).toBe("first-run-overlay");

    // ...and nothing in-flow sits between the dashboard column and the overlay
    // either. A wrapper on the outside still occupies flow: the historical one
    // carried `mb-6`, so even collapsed to zero height it moved `section.panel`
    // by its own margin the moment onboarding appeared.
    expect(overlay.parentElement).toBe(panel!.parentElement);
  });

  it("has no ancestor that would turn its fixed positioning back into flow-coupled positioning", async () => {
    // `position: fixed` resolves against the viewport only while no ancestor
    // establishes a containing block. `transform`, `filter`, `perspective` and
    // `contain` all do, and any of them appearing on `.page-shell` or a sibling
    // wrapper later would silently re-anchor this overlay to the scrolling
    // column it was just taken out of. Checked against the real stylesheet, per
    // ancestor, rather than assumed.
    render(<Home />);
    const dialog = await screen.findByTestId("onboarding-container");
    const css = readCss();

    const offenders: string[] = [];
    for (let node = dialog.parentElement; node && node !== document.body; node = node.parentElement) {
      for (const className of Array.from(node.classList)) {
        const body = ruleBody(css, `.${className}`);
        if (body && /(^|[\s;])(transform|filter|perspective|contain):/.test(body)) {
          offenders.push(`.${className}`);
        }
      }
    }

    expect(offenders, "an ancestor establishes a containing block for fixed positioning").toEqual([]);
  });

  it("declares the overlay as fixed and full-viewport in the stylesheet", () => {
    const css = readCss();
    const overlay = ruleBody(css, ".first-run-overlay");

    // Negative control: if the class is renamed or removed, every assertion
    // below would otherwise pass vacuously against an empty string.
    expect(overlay, "`.first-run-overlay` is not defined in globals.css").not.toBeNull();

    expect(overlay).toMatch(/position:\s*fixed/);
    expect(overlay).toMatch(/inset:\s*0/);
    // Above the sticky site nav, below the skip link, which stays the page's
    // first tab stop.
    const zIndex = overlay!.match(/z-index:\s*(\d+)/);
    expect(zIndex, "the overlay declares no z-index, so the sticky nav paints over it").not.toBeNull();
    expect(Number(zIndex![1])).toBeGreaterThan(20);
    expect(Number(zIndex![1])).toBeLessThan(60);
  });

  it("expresses its motion as CSS animation, so the reduced-motion reset already covers it", () => {
    const css = readCss();

    // v0.8 replaced a hand-enumerated list of animated classes with one
    // sweeping universal reset. Anything animated with CSS is covered for free;
    // anything animated from JavaScript has to read the preference itself (as
    // ProgressRing does). These two are CSS, deliberately.
    expect(ruleBody(css, ".first-run-overlay")).toMatch(/animation:\s*\S+/);
    expect(ruleBody(css, ".first-run-dialog")).toMatch(/animation:\s*\S+/);

    const reset = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reset, "the reduced-motion block is gone").not.toBe("");
    expect(reset).toContain("animation-duration: 0.01ms !important");
    // The universal selector is what makes the coverage automatic.
    expect(reset).toMatch(/\*,\s*\n\s*\*::before/);
  });
});

describe("first-run overlay: it behaves like the modal it now is", () => {
  const noop = () => {};

  afterEach(() => {
    cleanup();
  });

  it("is a labelled modal dialog", () => {
    render(<Onboarding onComplete={noop} onSkip={noop} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-testid")).toBe("onboarding-container");

    // The accessible name comes from the real heading, not a duplicated string.
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe("Personalize your coach");
  });

  it("moves focus into the dialog when it appears", () => {
    render(<Onboarding onComplete={noop} onSkip={noop} />);

    expect(document.activeElement).toBe(screen.getByTestId("onboarding-container"));
  });

  it("maps Escape to the existing skip action", () => {
    const onSkip = vi.fn();
    render(<Onboarding onComplete={noop} onSkip={onSkip} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside the dialog in both directions", () => {
    render(<Onboarding onComplete={noop} onSkip={noop} />);

    const dialog = screen.getByTestId("onboarding-container");
    const focusable = focusableIn(dialog);
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
