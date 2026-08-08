"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { goToRouteGroups, goToRoutes } from "@/lib/routes";

// Everything listed in the dialog is real behavior. The go-to chords are
// implemented here; the arrow keys live in SwipeStepCard; the rest is
// standard browser behavior.
//
// The chord table and the "Go to X" rows are DERIVED from `src/lib/routes.ts`
// (v0.22 D5, D6), never written down twice. Until PR1 this file carried two
// hand-maintained copies of the same six destinations under a comment asking
// the next reader to "keep this table honest"; PR1 replaced the comment with a
// guard, and this makes the two copies one. A chord the dialog does not
// advertise, and a row whose chord does nothing, are now unrepresentable
// instead of merely tested for: both come from the same registry entry.
const GO_TO_TARGETS: Record<string, string> = Object.fromEntries(
  goToRoutes().map((route) => [route.goToKey, route.path]),
);

// How long the "g" prefix stays armed before quietly resetting. Purely an
// internal grace window so a stray "g" never navigates minutes later.
const CHORD_WINDOW_MS = 2000;

type ShortcutRow = {
  keys: string[];
  // "then" joins the steps of a chord; "or" joins equivalent alternatives.
  separator?: "then" | "or";
  description: string;
};

// The five rows that describe behavior which is not a route stay hand authored
// (D6): the help keys are this component's own, the arrows belong to
// SwipeStepCard, and Tab and Enter are the browser's. Inventing registry
// entries for them would be the same mistake as giving the registry fields
// nothing navigates by.
const HELP_ROWS: ShortcutRow[] = [
  { keys: ["?"], description: "Open this help" },
  { keys: ["Esc"], description: "Close this help" },
];

const BROWSER_ROWS: ShortcutRow[] = [
  {
    keys: ["Left / Right arrow"],
    description: "Previous or next step while a step card is focused",
  },
  {
    keys: ["Tab", "Shift + Tab"],
    separator: "or",
    description: "Move focus between controls",
  },
  { keys: ["Enter"], description: "Activate the focused control" },
];

// A run of rows, optionally under a heading. The heading is the only new idea
// in v0.24 D5: the dialog grows from seven navigation rows to twelve in the
// same edit that gives it headings to put them under, so twelve rows read as
// four short lists rather than one longer one - the same argument the "More"
// panel answers with the same four categories, from the same registry.
type ShortcutSection = {
  /** `null` for the two runs that describe behaviour which is not a route. */
  heading: string | null;
  rows: ShortcutRow[];
};

// One row per registry entry that carries a chord, grouped and ordered by the
// registry, labelled with the registry's own word so the dialog and the nav
// never call the same destination two different things. Nothing here is
// written down twice: a route that changes category moves in both surfaces,
// which is why D5 needs no drift guard between them.
const NAVIGATION_SECTIONS: ShortcutSection[] = goToRouteGroups().map((section) => ({
  heading: section.group,
  rows: section.routes.map((route) => ({
    keys: ["g", route.goToKey],
    separator: "then" as const,
    description: `Go to ${route.label}`,
  })),
}));

// The hand-authored runs stay outside the groups and keep their positions:
// the help keys first, the browser behaviours last, the registry's categories
// between them (D6, unchanged by v0.24 D5).
const SHORTCUT_SECTIONS: ShortcutSection[] = [
  { heading: null, rows: HELP_ROWS },
  ...NAVIGATION_SECTIONS,
  { heading: null, rows: BROWSER_ROWS },
];

// Never hijack typing: shortcuts stay quiet while focus is in any editable
// control, so the shortcut keys can always be typed as normal text.
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function KeyboardHelp() {
  const router = useRouter();
  const titleId = useId();
  const introId = useId();
  // One stable base per mount; each labelled section suffixes it with its
  // index, so a category renamed to something with a space or a slash cannot
  // produce a duplicate or invalid id.
  const sectionIdBase = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const chordTimerRef = useRef<number | null>(null);
  const chordArmedRef = useRef(false);

  const disarmChord = useCallback(() => {
    chordArmedRef.current = false;
    if (chordTimerRef.current !== null) {
      window.clearTimeout(chordTimerRef.current);
      chordTimerRef.current = null;
    }
  }, []);

  const openDialog = useCallback(() => {
    const active = document.activeElement;
    restoreFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    disarmChord();
    setOpen(true);
  }, [disarmChord]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    const target = restoreFocusRef.current ?? triggerRef.current;
    restoreFocusRef.current = null;
    target?.focus();
  }, []);

  // Move focus into the dialog as soon as it opens.
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      if (open && event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        if (!open) {
          openDialog();
        }
        return;
      }

      if (open) {
        return;
      }

      if (chordArmedRef.current) {
        const href = GO_TO_TARGETS[event.key.toLowerCase()];
        disarmChord();
        if (href) {
          event.preventDefault();
          router.push(href);
        }
        return;
      }

      if (event.key === "g" || event.key === "G") {
        chordArmedRef.current = true;
        chordTimerRef.current = window.setTimeout(disarmChord, CHORD_WINDOW_MS);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, router, closeDialog, openDialog, disarmChord]);

  // Clear any pending chord timer on unmount.
  useEffect(() => disarmChord, [disarmChord]);

  // Keep focus cycling inside the dialog while it is open.
  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="keyboard-help-trigger"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openDialog}
      >
        <span aria-hidden="true">?</span>
      </button>

      {open ? (
        <div
          className="keyboard-help-overlay"
          onClick={closeDialog}
          data-testid="keyboard-help-overlay"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={introId}
            className="keyboard-help-dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="keyboard-help-header">
              <h2 id={titleId} className="keyboard-help-title">
                Keyboard shortcuts
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                className="keyboard-help-close"
                onClick={closeDialog}
              >
                Close
              </button>
            </div>
            <p id={introId} className="keyboard-help-intro">
              A few quiet shortcuts, always optional. Your mouse or touch works everywhere.
            </p>
            <div className="shortcut-sections">
              {SHORTCUT_SECTIONS.map((section, sectionIndex) => {
                const headingId =
                  section.heading === null ? undefined : `${sectionIdBase}-${sectionIndex}`;

                return (
                  <div
                    key={section.heading ?? `unlabelled-${sectionIndex}`}
                    className="shortcut-section"
                  >
                    {section.heading === null ? null : (
                      <h3 id={headingId} className="shortcut-group-heading">
                        {section.heading}
                      </h3>
                    )}
                    <ul className="shortcut-list" aria-labelledby={headingId}>
                      {section.rows.map((row) => (
                        <li key={row.description} className="shortcut-row">
                          <span className="shortcut-desc">{row.description}</span>
                          <span className="shortcut-keys">
                            {row.keys.map((key, index) => (
                              <span key={key} className="shortcut-key-group">
                                {index > 0 && row.separator ? (
                                  <span className="shortcut-then">{row.separator}</span>
                                ) : null}
                                <kbd>{key}</kbd>
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
