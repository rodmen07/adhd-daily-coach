import { beforeEach, describe, expect, it } from "vitest";
import {
  addFocusSession,
  listFocusSessions,
  putFocusSession,
  summarizeFocusSessions,
  type FocusSession,
} from "@/lib/focus-session";
import { FOCUS_SESSION_COPY, focusWeekRecap } from "@/lib/focus-session-copy";

beforeEach(() => {
  window.localStorage.clear();
});

function mk(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: overrides.id ?? "x",
    task: overrides.task ?? "write",
    plannedMinutes: overrides.plannedMinutes ?? 15,
    focusedSeconds: overrides.focusedSeconds ?? 15 * 60,
    outcome: overrides.outcome ?? "wrapped-up",
    date: overrides.date ?? new Date().toISOString().slice(0, 10),
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

describe("focus-session store", () => {
  it("starts empty", () => {
    expect(listFocusSessions()).toEqual([]);
  });

  it("adds and lists a session, stamping id/date/createdAt", () => {
    const saved = addFocusSession({
      task: "draft the intro",
      plannedMinutes: 15,
      focusedSeconds: 900,
      outcome: "wrapped-up",
    });
    expect(saved.id).toBeTruthy();
    expect(saved.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saved.createdAt).toBeTruthy();

    const listed = listFocusSessions();
    expect(listed).toHaveLength(1);
    expect(listed[0].task).toBe("draft the intro");
  });

  it("keeps sessions isolated by scope (guest vs signed-in)", () => {
    addFocusSession({ task: "a", plannedMinutes: 5, focusedSeconds: 300, outcome: "wrapped-up" }, "guest");
    addFocusSession({ task: "b", plannedMinutes: 5, focusedSeconds: 300, outcome: "wrapped-up" }, "user-1");
    expect(listFocusSessions("guest")).toHaveLength(1);
    expect(listFocusSessions("user-1")).toHaveLength(1);
    expect(listFocusSessions("guest")[0].task).toBe("a");
  });

  it("records both close-out outcomes without treating either as a failure", () => {
    addFocusSession({ task: "a", plannedMinutes: 15, focusedSeconds: 900, outcome: "wrapped-up" });
    addFocusSession({ task: "b", plannedMinutes: 15, focusedSeconds: 120, outcome: "stopped-early" });
    const outcomes = listFocusSessions().map((s) => s.outcome);
    expect(outcomes).toEqual(["wrapped-up", "stopped-early"]);
  });

  it("survives corrupt storage without throwing", () => {
    window.localStorage.setItem("calm-daily-coach-focus-sessions:guest", "{not json");
    expect(listFocusSessions()).toEqual([]);
  });
});

// v0.13: the writer the guest-to-account migration copies through. The whole
// reason it exists separately from addFocusSession is that a copy must NOT be
// restamped, so these assert the two properties the migration depends on.
describe("putFocusSession", () => {
  it("stores an existing session verbatim, keeping its id, date and createdAt", () => {
    const original = mk({
      id: "session-from-last-tuesday",
      task: "read one chapter",
      date: "2026-07-14",
      createdAt: "2026-07-14T19:30:00.000Z",
    });

    putFocusSession(original, "user-123");

    const [stored] = listFocusSessions("user-123");
    // addFocusSession would have minted a fresh id and filed this under
    // today, quietly moving a session out of the week it belonged to.
    expect(stored).toEqual(original);
  });

  it("is idempotent by id, so a repeated copy rewrites rather than duplicates", () => {
    // This is what lets the migration skip the conflict guard: the local
    // backend has to behave like setDoc on focusSessions/{id}, not like an
    // append. Without it a retried copy would double every session.
    const session = mk({ id: "same-id", task: "draft the intro" });

    putFocusSession(session, "user-123");
    putFocusSession({ ...session, task: "draft the intro (edited upstream)" }, "user-123");

    const stored = listFocusSessions("user-123");
    expect(stored).toHaveLength(1);
    expect(stored[0].task).toBe("draft the intro (edited upstream)");
  });

  it("leaves sessions already in the scope alone", () => {
    const existing = addFocusSession(
      { task: "their own work", plannedMinutes: 5, focusedSeconds: 300, outcome: "wrapped-up" },
      "user-123",
    );

    putFocusSession(mk({ id: "copied-in", task: "guest work" }), "user-123");

    const stored = listFocusSessions("user-123");
    expect(stored).toHaveLength(2);
    expect(stored.map((s) => s.id)).toContain(existing.id);
    expect(stored.map((s) => s.id)).toContain("copied-in");
  });
});

describe("summarizeFocusSessions", () => {
  const now = new Date("2026-07-23T12:00:00Z");
  const today = "2026-07-23";

  it("counts today's sessions and whole minutes", () => {
    const sessions = [
      mk({ date: today, focusedSeconds: 900 }), // 15m
      mk({ date: today, focusedSeconds: 330 }), // 5m (5.5 floors to 5)
    ];
    const s = summarizeFocusSessions(sessions, now);
    expect(s.sessionsToday).toBe(2);
    expect(s.minutesToday).toBe(20);
  });

  it("counts the trailing 7 days for the weekly figures", () => {
    const sessions = [
      mk({ date: today, focusedSeconds: 600 }), // in today + week
      mk({ date: "2026-07-18", focusedSeconds: 600 }), // 5 days ago: in week
      mk({ date: "2026-07-10", focusedSeconds: 600 }), // >7 days ago: out
    ];
    const s = summarizeFocusSessions(sessions, now);
    expect(s.sessionsToday).toBe(1);
    expect(s.sessionsThisWeek).toBe(2);
    expect(s.minutesThisWeek).toBe(20);
  });

  it("is empty-safe and never negative", () => {
    expect(summarizeFocusSessions([], now)).toEqual({
      sessionsToday: 0,
      minutesToday: 0,
      sessionsThisWeek: 0,
      minutesThisWeek: 0,
    });
  });

  it("never exposes a streak, target, or completion-rate field", () => {
    const s = summarizeFocusSessions([mk({ date: today })], now) as Record<string, unknown>;
    for (const key of Object.keys(s)) {
      expect(key).not.toMatch(/streak|target|goal|rate|score/i);
    }
  });
});

describe("focus-session copy stays calm and pressure-free", () => {
  it("uses no streak, shame, or failure language", () => {
    const all = Object.values(FOCUS_SESSION_COPY).join(" ");
    expect(all).not.toMatch(/streak/i);
    expect(all).not.toMatch(/\bfail(ed|ure)?\b/i);
    expect(all).not.toMatch(/\bshould\b/i);
    expect(all).not.toMatch(/don'?t break/i);
    expect(all).not.toMatch(/\bmissed\b/i);
  });

  // The /trends recap (v0.12) is COMPOSED at runtime, so the static join
  // above cannot see the sentence a person actually reads. Run the real
  // builder across the shapes the page can produce and hold it to the same
  // bar, including the zero week - the one most likely to acquire pressure
  // language later.
  const PRESSURE_PATTERNS = [
    /streak/i,
    /\bfail(ed|ure)?\b/i,
    /\bshould\b/i,
    /\bmissed\b/i,
    /\b(goal|target|quota)\b/i,
    /\b\d+% (of|complete)\b/i,
  ];

  function pressureLanguageIn(line: string): string[] {
    return PRESSURE_PATTERNS.filter((pattern) => pattern.test(line)).map(String);
  }

  it("keeps the composed weekly recap calm across every shape", () => {
    const shapes: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 5],
      [2, 35],
      [9, 240],
    ];

    for (const [sessions, minutes] of shapes) {
      expect(pressureLanguageIn(focusWeekRecap(sessions, minutes))).toEqual([]);
    }
  });

  // Negative control (the done-when in docs/design/FOCUS_IN_TRENDS.md section
  // 5 asks for it explicitly): a guard nobody has watched fail is not a guard.
  // Proves the battery above can actually fire, so the empty result for the
  // real copy means something.
  it("the calm-tone guard actually fires on pressuring copy", () => {
    expect(
      pressureLanguageIn("You failed your 5-session goal, missed 2 days, and broke a 3-day streak."),
    ).toHaveLength(4);
    expect(pressureLanguageIn("You should have hit 80% complete this week.")).toHaveLength(2);
  });

  it("reports what happened, singular and plural, and never '0 minutes'", () => {
    expect(focusWeekRecap(0, 0)).toBe(FOCUS_SESSION_COPY.trendsEmptyWeek);
    expect(focusWeekRecap(1, 5)).toBe("You focused through 1 session this week, 5 minutes in total.");
    expect(focusWeekRecap(1, 1)).toBe("You focused through 1 session this week, 1 minute in total.");
    expect(focusWeekRecap(2, 35)).toBe(
      "You focused through 2 sessions this week, 35 minutes in total.",
    );
    // A sub-minute session still happened; saying "0 minutes" would read as a
    // failed session, which the product rules forbid.
    expect(focusWeekRecap(1, 0)).toBe("You focused through 1 session this week.");
  });
})
