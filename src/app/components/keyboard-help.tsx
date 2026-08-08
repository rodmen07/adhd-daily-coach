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

// Everything listed in the dialog is real behavior. The go-to chords are
// implemented here; the arrow keys live in SwipeStepCard; the rest is
// standard browser behavior.
//
// Exported so `src/app/__tests__/route-registry-guard.test.ts` can hold this
// table and `src/lib/routes.ts`'s `goToKey` fields in agreement. That guard is
// what replaces the "keep this table honest" comment that used to sit here
// doing a test's job; v0.22 PR2 removes the need for the comparison entirely
// by deriving both this table and the dialog's rows from the registry (D5, D6).
export const GO_TO_TARGETS: Record<string, string> = {
  d: "/",
  f: "/focus",
  e: "/execute",
  r: "/review",
  t: "/trends",
  j: "/journal",
};

// How long the "g" prefix stays armed before quietly resetting. Purely an
// internal grace window so a stray "g" never navigates minutes later.
const CHORD_WINDOW_MS = 2000;

type ShortcutRow = {
  keys: string[];
  // "then" joins the steps of a chord; "or" joins equivalent alternatives.
  separator?: "then" | "or";
  description: string;
};

const SHORTCUT_ROWS: ShortcutRow[] = [
  { keys: ["?"], description: "Open this help" },
  { keys: ["Esc"], description: "Close this help" },
  { keys: ["g", "d"], separator: "then", description: "Go to Dashboard" },
  { keys: ["g", "f"], separator: "then", description: "Go to Focus" },
  { keys: ["g", "e"], separator: "then", description: "Go to Execute" },
  { keys: ["g", "r"], separator: "then", description: "Go to Review" },
  { keys: ["g", "t"], separator: "then", description: "Go to Trends" },
  { keys: ["g", "j"], separator: "then", description: "Go to Journal" },
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
            <ul className="shortcut-list">
              {SHORTCUT_ROWS.map((row) => (
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
        </div>
      ) : null}
    </>
  );
}
