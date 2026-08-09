"use client";

import { useMemo } from "react";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { createCheckinStore } from "@/lib/checkin-store";

/**
 * Where today's check-in lives: on this device, or in the account.
 *
 * v0.26 D4 (docs/design/HEADER_ACTIONS.md) changed two things about it and
 * nothing else. Both are in this file's shape rather than in its logic - the
 * five states, their words and the backend resolution below are byte-identical
 * to what shipped before.
 *
 * 1. THE EXPLANATION IS NO LONGER TRAPPED IN `title`. Every state used to carry
 *    its sentence only as a `title` attribute (section 1f of the design doc):
 *    that never appears on touch, is not surfaced by every screen reader, and
 *    has no keyboard path at all. The sentence is now the second half of the
 *    pill's ACCESSIBLE NAME, and `title` is kept for the pointer users it does
 *    serve. `role="img"` is what makes that name legal and exposed: a name on a
 *    role-less `<div>` is `aria-prohibited-attr` to axe, which the Lighthouse
 *    gate runs.
 *
 *    Deliberately NOT `role="status"`. A live region here would announce the
 *    sync state on every page load, which is noise on a product whose first
 *    rule is calm.
 *
 * 2. THE WORD COLLAPSES BELOW THE 56rem CAP, AND ONLY VISUALLY. `.site-nav-inner`
 *    caps at 56rem, and under it the badge is a dot; over it the word is back.
 *    That is one media query in globals.css against `.sync-status-word` - no
 *    width is read here, no `matchMedia`, no second render path. The accessible
 *    name therefore cannot depend on the viewport, which is the property that
 *    makes collapsing a status indicator safe rather than lossy, and
 *    `__tests__/sync-status-badge.test.tsx` asserts it by accessible name at
 *    two simulated widths rather than trusting it.
 *
 * The five branches used to be five near-identical blocks of JSX. They are one
 * table plus one render now because D4 adds three things to each of them (the
 * role, the name, the word's class), and five copies of that is five chances
 * for one state to be announced differently from its neighbours. Every class
 * string is still a LITERAL in this file so Tailwind v4's source scanner keeps
 * finding them.
 */

type SyncTone = "amber" | "emerald" | "sky";

/**
 * The tone triples, spelled once. Each is the same shape the five branches
 * carried inline before: a translucent fill, a solid text/dot colour, and a
 * matching border.
 */
const TONES: Record<SyncTone, { readonly pill: string; readonly dot: string }> = {
  amber: {
    pill: "bg-amber-500/10 text-amber-500 border border-amber-500/30",
    dot: "bg-amber-500",
  },
  emerald: {
    pill: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  sky: {
    pill: "bg-sky-500/10 text-sky-500 border border-sky-500/30",
    dot: "bg-sky-500",
  },
};

const PILL_BASE =
  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider transition-colors";

const DOT_BASE = "h-1.5 w-1.5 rounded-full";

type SyncState = {
  /** The word on the pill above the cap, and the first half of the accessible name. */
  readonly label: string;
  /** The sentence that used to live only in `title`. Now also the second half of the name. */
  readonly explanation: string;
  readonly tone: SyncTone;
  /**
   * The dot pulses while the answer is provisional (auth still resolving, or a
   * backend that may yet come back); it is still while the answer is settled.
   * Preserved exactly as the five branches had it.
   */
  readonly pulse: boolean;
};

export function SyncStatusBadge() {
  const { authUser, authConfigured } = useCoachAuth();
  // Recompute on auth changes: with NEXT_PUBLIC_CHECKIN_BACKEND unset, the
  // backend resolves to Firestore only for signed-in users on Firebase-enabled
  // deployments, so the badge must track sign-in state to stay truthful.
  const backend = useMemo(
    () => createCheckinStore(undefined, { signedIn: Boolean(authUser) }).backend,
    [authUser],
  );

  const state = resolveSyncState(authConfigured, authUser?.email ?? null, Boolean(authUser), backend);
  const tone = TONES[state.tone];

  return (
    <div
      className={`${PILL_BASE} ${tone.pill}`}
      role="img"
      aria-label={`${state.label}. ${state.explanation}`}
      title={state.explanation}
    >
      <span className={`${DOT_BASE} ${tone.dot}${state.pulse ? " animate-pulse" : ""}`} />
      <span className="sync-status-word">{state.label}</span>
    </div>
  );
}

/**
 * The same five-way decision the component made inline, in the same order.
 * Exported to nothing: it is a pure function so the states can be reasoned
 * about (and asserted) without a render, and so the component body stays the
 * one place that talks to React.
 */
function resolveSyncState(
  authConfigured: boolean,
  email: string | null,
  signedIn: boolean,
  backend: string,
): SyncState {
  if (!authConfigured) {
    return {
      label: "GUEST (LOCAL)",
      explanation:
        "Firebase authentication is not configured in environment variables. Local backup enabled",
      tone: "amber",
      pulse: true,
    };
  }

  if (signedIn) {
    if (backend === "firestore") {
      return {
        label: "CLOUD SYNCED",
        explanation: `Check-ins sync to Firestore. Registered user: ${email}`,
        tone: "emerald",
        pulse: true,
      };
    }

    if (backend === "firestore-fallback") {
      return {
        label: "SYNC OFF (LOCAL)",
        explanation:
          "Cloud sync is configured but Firestore is unavailable right now. Check-ins are saved on this device",
        tone: "amber",
        pulse: true,
      };
    }

    return {
      label: "SIGNED IN (LOCAL)",
      explanation: `Signed in as ${email}, but check-ins stay on this device. Cloud sync is not enabled for this deployment`,
      tone: "sky",
      pulse: false,
    };
  }

  return {
    label: "LOCAL WORKSPACE",
    explanation:
      "All data saved on your device. Authenticate with Google to back up and sync across devices",
    tone: "amber",
    pulse: false,
  };
}
