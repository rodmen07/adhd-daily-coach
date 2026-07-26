/**
 * "One thing now" focus sessions: a calm, single-task timer.
 *
 * Product rules this module enforces by design (see the coach product rules:
 * no streaks, no pressure, no failure states):
 *
 * - Only sessions the person deliberately CLOSES OUT are recorded. A session
 *   abandoned by navigating away is never written, so there is no "you gave up"
 *   record and nothing to feel guilty about. Abandonment is a neutral non-event.
 * - Both close-out outcomes ("wrapped up" and "stopped for now") are recorded
 *   plainly and neither is a failure.
 * - Summaries report what happened (sessions, minutes) and never a streak,
 *   a target, or a completion rate.
 *
 * Local-first, mirroring `browser-checkins.ts`. Firestore sync (v0.12 PR2)
 * layers on top through `focus-session-store.ts` rather than replacing this
 * module: the local functions below stay the fallback path, exactly as
 * `browser-checkins.ts` does for check-ins and `journal.ts` for the journal.
 */

export type FocusSessionOutcome = "wrapped-up" | "stopped-early";

export type FocusSession = {
  id: string;
  /** The one thing the person chose to focus on. */
  task: string;
  /** Minutes they set out to focus for. */
  plannedMinutes: number;
  /** Seconds actually spent focusing before closing out. */
  focusedSeconds: number;
  outcome: FocusSessionOutcome;
  /** YYYY-MM-DD, local. */
  date: string;
  /** ISO timestamp the session was recorded. */
  createdAt: string;
};

export type FocusSessionInput = Omit<FocusSession, "id" | "date" | "createdAt">;

export type FocusSessionSummary = {
  sessionsToday: number;
  minutesToday: number;
  sessionsThisWeek: number;
  minutesThisWeek: number;
};

const STORAGE_KEY = "calm-daily-coach-focus-sessions";

function storageKey(scopeKey: string) {
  return `${STORAGE_KEY}:${scopeKey}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID; the value only needs
  // to be unique within one browser's storage, not cryptographically strong.
  return `fs-${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`;
}

function parse(raw: string | null): FocusSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FocusSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listFocusSessions(scopeKey = "guest"): FocusSession[] {
  if (typeof window === "undefined") return [];
  return parse(window.localStorage.getItem(storageKey(scopeKey)));
}

/**
 * Stamp a closed-out session with its id, local date, and creation time.
 *
 * Extracted so the local writer below and the Firestore writer
 * (`firestore-focus-sessions.ts`, v0.12 PR2) produce byte-identical record
 * shapes from one place: a person who signs in mid-week must not end up with
 * two subtly different session schemas depending on which backend recorded
 * the session.
 */
export function buildFocusSession(input: FocusSessionInput): FocusSession {
  return {
    ...input,
    id: makeId(),
    date: todayDate(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Store an ALREADY-STAMPED session verbatim, keyed by its own id (v0.13).
 *
 * `addFocusSession` mints a fresh id, date, and createdAt, which is right for
 * a session someone just closed out and wrong for a copy: guest-to-account
 * migration has to land the same record in the account scope, or a session run
 * last Tuesday is refiled under today and the week it belonged to loses it.
 *
 * Writing BY ID rather than appending also gives this backend the same
 * idempotency the Firestore one already has by construction (`setDoc` on
 * `focusSessions/{session.id}`), so a repeated copy overwrites one document
 * instead of growing a duplicate. That equivalence is what lets the migration
 * skip the conflict guard - see `focus-session-store.ts`.
 *
 * No-op-safe on the server, like every other writer here.
 */
export function putFocusSession(session: FocusSession, scopeKey = "guest"): FocusSession {
  if (typeof window === "undefined") return session;
  const existing = listFocusSessions(scopeKey);
  const index = existing.findIndex((stored) => stored.id === session.id);
  const next =
    index === -1
      ? [...existing, session]
      : existing.map((stored, position) => (position === index ? session : stored));
  window.localStorage.setItem(storageKey(scopeKey), JSON.stringify(next));
  return session;
}

/**
 * Record a closed-out session. Returns the stored record. No-op-safe on the
 * server (returns the record without persisting).
 */
export function addFocusSession(input: FocusSessionInput, scopeKey = "guest"): FocusSession {
  // A freshly built session always carries a new id, so this appends; the
  // shared writer exists so the local backend has exactly one place that
  // serialises the list.
  return putFocusSession(buildFocusSession(input), scopeKey);
}

/** Whole minutes focused across a set of sessions (rounded down, floored at 0). */
function totalMinutes(sessions: FocusSession[]): number {
  const seconds = sessions.reduce((sum, s) => sum + Math.max(0, s.focusedSeconds), 0);
  return Math.floor(seconds / 60);
}

/**
 * Summarise sessions relative to a reference day (defaults to today). Reports
 * counts and minutes only. Deliberately never computes a streak, a target, or a
 * completion rate, which the product rules forbid. `now` is injectable so the
 * summary stays a pure function of its inputs and is testable.
 */
export function summarizeFocusSessions(
  sessions: readonly FocusSession[],
  now: Date = new Date(),
): FocusSessionSummary {
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const todays = sessions.filter((s) => s.date === today);
  const weeks = sessions.filter((s) => s.date >= weekAgo && s.date <= today);

  return {
    sessionsToday: todays.length,
    minutesToday: totalMinutes(todays),
    sessionsThisWeek: weeks.length,
    minutesThisWeek: totalMinutes(weeks),
  };
}
