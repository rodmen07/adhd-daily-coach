/**
 * User-facing copy for the "one thing now" focus session, kept in one place so
 * a test can assert the whole surface stays calm and pressure-free (no streaks,
 * no shame, no failure framing), matching the guards on affirmations and
 * reminder notifications.
 */
export const FOCUS_SESSION_COPY = {
  heading: "One thing, right now",
  subheading: "Pick a single thing to focus on for a little while. There is no pressure here, and you can stop whenever you need to.",
  taskLabel: "What's the one thing?",
  taskPlaceholder: "e.g. draft the first paragraph",
  durationLabel: "How long feels right?",
  start: "Start focusing",
  focusingOn: "Focusing on",
  wrapUp: "I wrapped up",
  stopEarly: "Stop for now",
  // Both close-outs are gentle; neither is a failure.
  wrappedUpNote: "Nice, that's done. Rest is part of the work too.",
  stoppedEarlyNote: "That's completely fine. Any focused time counts.",
  // Shown when the timer's planned time elapses; not a deadline, just a nudge.
  timeUpNote: "That's the time you set, whenever you're ready to wrap up.",
  summaryToday: "focused today",
  emptyToday: "No sessions yet today, and that's okay.",
  // v0.12: the weekly recap surfaced on /trends beside the check-in trends.
  trendsHeading: "Focus sessions this week",
  trendsSessionsLabel: "Sessions",
  trendsMinutesLabel: "Minutes focused",
  trendsEmptyWeek: "No focus sessions yet this week, and that's completely fine.",
} as const;

/**
 * The weekly focus recap sentence rendered on /trends.
 *
 * Kept here rather than assembled in the page so the whole user-facing surface
 * stays inside the one module the calm-tone guard test reads: a sentence built
 * from fragments in a component would slip past that guard. Reports what
 * happened and nothing else - no streak, no target, no completion rate.
 */
export function focusWeekRecap(sessionsThisWeek: number, minutesThisWeek: number): string {
  if (sessionsThisWeek <= 0) {
    return FOCUS_SESSION_COPY.trendsEmptyWeek;
  }

  const sessions = `${sessionsThisWeek} ${sessionsThisWeek === 1 ? "session" : "sessions"}`;

  // Sessions shorter than a minute round down to zero; say so plainly rather
  // than reporting "0 minutes", which reads like a failed session.
  if (minutesThisWeek <= 0) {
    return `You focused through ${sessions} this week.`;
  }

  const minutes = `${minutesThisWeek} ${minutesThisWeek === 1 ? "minute" : "minutes"}`;
  return `You focused through ${sessions} this week, ${minutes} in total.`;
}

/** The gentle OS-notification copy for when the planned time elapses. */
export const FOCUS_SESSION_NOTIFICATION_TITLE = "Focus time";
export const FOCUS_SESSION_NOTIFICATION_BODY =
  "That's the time you set aside, whenever you're ready to wrap up.";
export const FOCUS_SESSION_NOTIFICATION_TAG = "focus-session-timeup";
