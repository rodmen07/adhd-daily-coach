import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_URL,
  buildReminderCalendarIcs,
  downloadReminderCalendar,
  escapeIcsText,
  foldIcsLine,
  REMINDER_CALENDAR_FILE_NAME,
} from "@/lib/reminder-ics";
import type { ReminderPreferences } from "@/lib/reminder-preferences";

const encoder = new TextEncoder();

function prefs(overrides?: Partial<ReminderPreferences>): ReminderPreferences {
  return { enabled: true, time: "09:00", channel: "calendar", ...overrides };
}

// Local morning of 2026-07-19, before the 09:00 reminder time.
const BEFORE_NINE = new Date(2026, 6, 19, 8, 59, 0, 0);
const AFTER_NINE = new Date(2026, 6, 19, 9, 1, 0, 0);

describe("buildReminderCalendarIcs", () => {
  it("builds a VCALENDAR with a daily recurring VEVENT and a display VALARM", () => {
    const ics = buildReminderCalendarIcs(prefs(), BEFORE_NINE);

    expect(ics).not.toBeNull();
    expect(ics!.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics!.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("PRODID:-//ADHD Daily Coach//ADHD Daily Coach//EN\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("RRULE:FREQ=DAILY\r\n");
    expect(ics).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\n");
    expect(ics).toContain("END:VALARM\r\n");
  });

  it("uses a floating local DTSTART at the chosen time, starting today when still ahead", () => {
    const ics = buildReminderCalendarIcs(prefs(), BEFORE_NINE)!;

    expect(ics).toContain("DTSTART:20260719T090000\r\n");
    expect(ics).not.toMatch(/DTSTART[^\r\n]*Z/);
    expect(ics).not.toContain("TZID");
  });

  it("starts tomorrow when the chosen time already passed today", () => {
    const ics = buildReminderCalendarIcs(prefs(), AFTER_NINE)!;

    expect(ics).toContain("DTSTART:20260720T090000\r\n");
  });

  it("uses CRLF delimiters on every line and keeps every physical line within 75 octets", () => {
    const ics = buildReminderCalendarIcs(prefs(), BEFORE_NINE)!;
    const lines = ics.split("\r\n");

    for (const line of lines) {
      expect(line).not.toContain("\n");
      expect(line).not.toContain("\r");
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("folds the long description line and unfolding restores the escaped text", () => {
    const ics = buildReminderCalendarIcs(prefs(), BEFORE_NINE)!;

    expect(ics).toContain("\r\n ");

    // Asserted against the exported APP_URL, not a duplicated literal: the URL
    // is derived from the repo name at build time (next.config.ts), so pinning
    // a slug here would have to be hand-flipped at the repo rename and would
    // fail the suite for a value the module never chose.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(
      `DESCRIPTION:A gentle nudge from ADHD Daily Coach. Open today's plan whenever you are ready.\\n${APP_URL}`,
    );
  });

  it("embeds an absolute https URL for the app, not a relative or empty value", () => {
    // The shape contract the derivation must keep: APP_URL lands bare in the
    // DESCRIPTION text and in the URL: property, where a relative or empty
    // string is unusable to a calendar client.
    expect(APP_URL).toMatch(/^https:\/\/[^\s]+\/$/);

    const ics = buildReminderCalendarIcs(prefs(), BEFORE_NINE)!;
    expect(ics.replace(/\r\n /g, "")).toContain(`URL:${APP_URL}`);
  });

  it("is deterministic: identical preferences and clock produce identical output", () => {
    const first = buildReminderCalendarIcs(prefs(), BEFORE_NINE);
    const second = buildReminderCalendarIcs(prefs(), BEFORE_NINE);

    expect(first).toBe(second);
  });

  it("keeps the UID stable across time changes so re-imports replace the event", () => {
    const nineOClock = buildReminderCalendarIcs(prefs(), BEFORE_NINE)!;
    const evening = buildReminderCalendarIcs(prefs({ time: "20:30" }), BEFORE_NINE)!;

    const uidOf = (ics: string) => /^UID:.+$/m.exec(ics.replace(/\r\n/g, "\n"))?.[0];
    expect(uidOf(nineOClock)).toBe("UID:focus-daily-reminder@rodmen07.github.io");
    expect(uidOf(evening)).toBe(uidOf(nineOClock));
  });

  it("returns null when reminders are opted out or the time is malformed", () => {
    expect(buildReminderCalendarIcs(prefs({ enabled: false }), BEFORE_NINE)).toBeNull();
    expect(buildReminderCalendarIcs(prefs({ time: "25:99" }), BEFORE_NINE)).toBeNull();
    expect(buildReminderCalendarIcs(prefs({ time: "" }), BEFORE_NINE)).toBeNull();
  });
});

describe("escapeIcsText", () => {
  it("escapes backslashes, semicolons, commas, and newlines", () => {
    expect(escapeIcsText("plan; rest, breathe\\repeat\ntomorrow")).toBe(
      "plan\\; rest\\, breathe\\\\repeat\\ntomorrow",
    );
    expect(escapeIcsText("windows\r\nline")).toBe("windows\\nline");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines unfolded", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds long lines to 75 octets with a leading space on continuations", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"a".repeat(200)}`);
    const physical = folded.split("\r\n");

    expect(physical.length).toBeGreaterThan(1);
    for (const [index, line] of physical.entries()) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
      if (index > 0) {
        expect(line.startsWith(" ")).toBe(true);
      }
    }
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"a".repeat(200)}`);
  });

  it("never splits a multi-byte character across physical lines", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"é".repeat(120)}`);

    for (const line of folded.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"é".repeat(120)}`);
  });
});

describe("downloadReminderCalendar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("triggers a Blob download with the calendar filename and revokes the URL", () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:focus-reminder");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    let downloadName = "";
    let downloadHref = "";
    vi.spyOn(HTMLElement.prototype, "click").mockImplementation(function (this: HTMLElement) {
      const anchor = this as HTMLAnchorElement;
      downloadName = anchor.download;
      downloadHref = anchor.href;
    });

    const triggered = downloadReminderCalendar(prefs(), BEFORE_NINE);

    expect(triggered).toBe(true);
    expect(downloadName).toBe(REMINDER_CALENDAR_FILE_NAME);
    expect(downloadHref).toContain("blob:focus-reminder");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/calendar;charset=utf-8");
    expect(blob.size).toBe(
      encoder.encode(buildReminderCalendarIcs(prefs(), BEFORE_NINE)!).length,
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:focus-reminder");
  });

  it("does nothing when reminders are opted out", () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:unused");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLElement.prototype, "click").mockImplementation(() => {});

    expect(downloadReminderCalendar(prefs({ enabled: false }), BEFORE_NINE)).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
