import type { ReminderPreferences } from "@/lib/reminder-preferences";

/**
 * Calendar (.ics) reminder channel, per docs/design/REMINDER_SCHEDULING.md.
 *
 * Everything here runs in the user's browser. The file is generated locally,
 * offered as a download, and the user imports it into their own calendar app,
 * which then does the reminding. Nothing is uploaded or sent anywhere.
 *
 * RFC 5545 decisions:
 * - Floating local DTSTART (no TZID, no UTC "Z") so the alarm rings at the
 *   chosen wall-clock time in most clients. Google Calendar pins floating
 *   times to the calendar's home timezone; this is a documented caveat.
 * - One VEVENT with RRULE:FREQ=DAILY and a display VALARM at event start.
 * - A stable UID so a re-downloaded file updates the existing event in place
 *   in most calendar apps instead of piling up duplicates.
 * - CRLF line delimiters and 75-octet line folding with a leading space on
 *   continuation lines, folding only between code points.
 * - TEXT values escape backslash, semicolon, comma, and newlines.
 */

export const REMINDER_CALENDAR_FILE_NAME = "focus-daily-reminder.ics";

/**
 * The live GitHub Pages URL, embedded in every downloaded .ics. It cannot be
 * derived from GITHUB_REPOSITORY (this runs client-side, not at build time),
 * so it is flipped by hand to the post-rename slug. Nothing else in the repo
 * depends on it, and a stale value would silently point every calendar
 * reminder a user already imported at a dead page.
 */
const APP_URL = "https://rodmen07.github.io/adhd-daily-coach/";
/**
 * Stable RFC 5545 dedup key, NOT a display string. Changing it makes a
 * re-imported file create a DUPLICATE recurring event instead of updating the
 * existing one, so it survives the rebrand unchanged.
 */
const CALENDAR_UID = "focus-daily-reminder@rodmen07.github.io";
const EVENT_SUMMARY = "ADHD Daily Coach: time for today's plan";
const EVENT_DESCRIPTION = `A gentle nudge from ADHD Daily Coach. Open today's plan whenever you are ready.\n${APP_URL}`;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_LINE_OCTETS = 75;

const encoder = new TextEncoder();

/** Escapes a TEXT property value per RFC 5545 section 3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds one logical content line into physical lines of at most 75 octets,
 * joined by CRLF with a single leading space on each continuation line
 * (RFC 5545 section 3.1). Splits only between code points so multi-byte
 * characters are never cut mid-sequence.
 */
export function foldIcsLine(line: string): string {
  const physicalLines: string[] = [];
  let current = "";
  let currentOctets = 0;

  for (const character of line) {
    const characterOctets = encoder.encode(character).length;
    if (currentOctets + characterOctets > MAX_LINE_OCTETS) {
      physicalLines.push(current);
      current = " ";
      currentOctets = 1;
    }
    current += character;
    currentOctets += characterOctets;
  }

  physicalLines.push(current);
  return physicalLines.join("\r\n");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Floating local DATE-TIME (no TZID, no "Z"), e.g. 20260801T183000. */
function formatLocalDateTime(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** UTC DATE-TIME for DTSTAMP, e.g. 20260801T183000Z. */
function formatUtcDateTime(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Next local occurrence of "HH:MM" from `now`: today if still ahead,
 * otherwise tomorrow. Mirrors msUntilNextOccurrence in reminder-schedule.ts.
 */
function nextOccurrence(time: string, now: Date): Date | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    return null;
  }

  const next = new Date(now);
  next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Builds the VCALENDAR text for the user's daily reminder, or null when
 * reminders are off or the stored time is malformed. Pure: same preferences
 * and `now` always produce the same output.
 */
export function buildReminderCalendarIcs(
  prefs: ReminderPreferences,
  now: Date = new Date(),
): string | null {
  if (!prefs.enabled) {
    return null;
  }

  const start = nextOccurrence(prefs.time, now);
  if (!start) {
    return null;
  }

  const logicalLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ADHD Daily Coach//ADHD Daily Coach//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${CALENDAR_UID}`,
    `DTSTAMP:${formatUtcDateTime(now)}`,
    `DTSTART:${formatLocalDateTime(start)}`,
    "DURATION:PT15M",
    "RRULE:FREQ=DAILY",
    `SUMMARY:${escapeIcsText(EVENT_SUMMARY)}`,
    `DESCRIPTION:${escapeIcsText(EVENT_DESCRIPTION)}`,
    `URL:${APP_URL}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(EVENT_SUMMARY)}`,
    "TRIGGER:PT0S",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${logicalLines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/**
 * Generates the calendar file and hands it to the browser as a download.
 * Returns true when a download was triggered. No network is involved; the
 * Blob lives entirely on the user's device.
 */
export function downloadReminderCalendar(
  prefs: ReminderPreferences,
  now: Date = new Date(),
): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const ics = buildReminderCalendarIcs(prefs, now);
  if (!ics) {
    return false;
  }

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = REMINDER_CALENDAR_FILE_NAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
