import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrendsPage from "@/app/trends/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { addCheckin, listCheckins, listCheckinsInRange } from "@/lib/browser-checkins";
import { addFocusSession, listFocusSessions, type FocusSession } from "@/lib/focus-session";
import { getFirestoreCheckinsInRange } from "@/lib/firestore-checkins";
import {
  listFirestoreFocusSessions,
  putFirestoreFocusSession,
} from "@/lib/firestore-focus-sessions";
import { FOCUS_SESSION_COPY } from "@/lib/focus-session-copy";
import { isFirebaseConfigured, loadFirebaseFirestore } from "@/lib/firebase";
import { bucketCheckinsByWeek } from "@/lib/trend-insights";
import type { Firestore } from "firebase/firestore";
import type { BrowserCheckin } from "@/lib/browser-checkins";

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => null),
}));

/** One switch for both halves of the v0.19 PR3 surface: the sync config
 * probe the store factory reads and the lazy client its adapters await. */
function mockFirebase(db: Firestore | null) {
  vi.mocked(isFirebaseConfigured).mockReturnValue(db !== null);
  vi.mocked(loadFirebaseFirestore).mockResolvedValue(db);
}

// Wraps the real browser-checkins implementation instead of replacing it, so
// the "renders with real local check-ins" tests below can seed history the
// same way browser-checkins.test.ts and journal-page.test.tsx do (through
// the real addCheckin/listCheckinsInRange functions against localStorage),
// while still letting the adapter-bypass regression test track whether
// listCheckins (the exact function review/page.tsx's bug calls directly) was
// ever invoked by this page.
vi.mock("@/lib/browser-checkins", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/browser-checkins")>();
  return {
    ...actual,
    listCheckins: vi.fn(actual.listCheckins),
  };
});

vi.mock("@/lib/firestore-checkins", () => ({
  addFirestoreCheckin: vi.fn(),
  getFirestoreWeeklySummary: vi.fn(),
  getFirestoreCheckinsInRange: vi.fn(),
}));

// v0.12 PR2: focus sessions resolve a backend the same way check-ins do, so a
// signed-in person's sessions come from Firestore. Mocked here so the
// signed-in tests below can prove WHICH source the page read from.
vi.mock("@/lib/firestore-focus-sessions", () => ({
  addFirestoreFocusSession: vi.fn(),
  listFirestoreFocusSessions: vi.fn(() => Promise.resolve([])),
  putFirestoreFocusSession: vi.fn((_db: unknown, stored: unknown) =>
    Promise.resolve(stored),
  ),
}));

/** The account-scoped key `putFocusSession` writes a copied session to. */
const ACCOUNT_SESSIONS_KEY = "calm-daily-coach-focus-sessions:user-123";

let storageWriteSpy: { mockRestore: () => void } | null = null;

/**
 * Make ONE localStorage key unwritable, the way a full quota or a browser with
 * storage turned off does. Kept identical to now-page.test.tsx's helper: the
 * two pages share the migration, so they share the failure injection.
 */
function failWritesTo(key: string) {
  const real = Storage.prototype.setItem;
  storageWriteSpy = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (this: Storage, writtenKey: string, value: string) {
      if (writtenKey === key) {
        throw new DOMException("exceeded the quota", "QuotaExceededError");
      }
      real.call(this, writtenKey, value);
    });
}

const guestAuthMock = {
  authUser: null,
  authMessage: "",
  authConfigured: false,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

const signedInAuthMock = {
  authUser: { uid: "user-123", email: "person@example.com" },
  authMessage: "",
  authConfigured: true,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

// UTC calendar-day keys, matching browser-checkins.ts's own date keying
// (toISOString().slice(0, 10)), relative to "now" so the suite stays
// deterministic regardless of which real day it runs on.
function utcDateKey(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function firestoreCheckin(partial: Partial<BrowserCheckin>): BrowserCheckin {
  return {
    id: partial.id ?? "1",
    date: partial.date ?? utcDateKey(2),
    focus: partial.focus ?? "Deep Work",
    dose: partial.dose ?? "medium",
    minutes: partial.minutes ?? 15,
    status: partial.status ?? "done",
    skipReason: partial.skipReason,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

function firestoreFocusSession(partial: Partial<FocusSession>): FocusSession {
  return {
    id: partial.id ?? "s1",
    task: partial.task ?? "their synced work",
    plannedMinutes: partial.plannedMinutes ?? 15,
    focusedSeconds: partial.focusedSeconds ?? 900,
    outcome: partial.outcome ?? "wrapped-up",
    date: partial.date ?? utcDateKey(1),
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

describe("Trends page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFirebase(null);
  });

  afterEach(() => {
    // Restore before cleanup so a test that threw mid-way never leaks a
    // storage stub into the next one.
    storageWriteSpy?.mockRestore();
    storageWriteSpy = null;
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the calm empty state with zero check-in history", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    render(<TrendsPage />);

    expect(await screen.findByTestId("empty-state-insights")).toBeTruthy();
    expect(screen.getByText("Your trends are still sprouting")).toBeTruthy();
  });

  it("renders 4 weekly buckets oldest to newest with real local check-in history", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    // One check-in per weekly bucket: oldest (~27 days ago) through the most
    // recent (today), all under the guest scope this page defaults to.
    addCheckin(
      { date: utcDateKey(25), focus: "Fitness", dose: "light", minutes: 5, status: "done" },
      "guest",
    );
    addCheckin(
      {
        date: utcDateKey(18),
        focus: "Fitness",
        dose: "light",
        minutes: 5,
        status: "skipped",
        skipReason: "busy",
      },
      "guest",
    );
    addCheckin(
      { date: utcDateKey(10), focus: "Deep Work", dose: "medium", minutes: 15, status: "done" },
      "guest",
    );
    addCheckin(
      { date: utcDateKey(1), focus: "Deep Work", dose: "deep", minutes: 30, status: "done" },
      "guest",
    );

    render(<TrendsPage />);

    const buckets = await screen.findAllByTestId("trend-bucket");
    expect(buckets).toHaveLength(4);

    // Compute the expected date-range labels the same way the page itself
    // does (today-anchored), rather than re-deriving the boundary math by
    // hand in the test, so this stays deterministic on any real run date.
    const expectedBuckets = bucketCheckinsByWeek([], 4);

    // DOM order is oldest-first: the earliest bucket's date range starts
    // furthest in the past, the last bucket's range ends on today.
    expect(buckets[0].textContent).toContain(
      `${expectedBuckets[0].windowStart} to ${expectedBuckets[0].windowEnd}`,
    );
    expect(buckets[0].textContent).toContain("1/1 complete");
    expect(buckets[3].textContent).toContain(
      `${expectedBuckets[3].windowStart} to ${expectedBuckets[3].windowEnd}`,
    );
    expect(buckets[3].textContent).toContain("1/1 complete");

    expect(screen.getByText("Overall completion")).toBeTruthy();
    expect(screen.queryByTestId("empty-state-insights")).toBeNull();
  });

  it("exposes a real heading hierarchy (one h1, subsections as h2) instead of visual-only labels", async () => {
    // Found during the v0.11 QA accessibility audit, 2026-07-20: "Weekly
    // completion", "Focus areas across the window", and "What the last 4
    // weeks show" were styled to look like subheadings (uppercase, bold,
    // tracking-wide) but were plain <p> tags, invisible to a screen reader's
    // heading-navigation list. This asserts the real semantic structure a
    // screen reader user relies on to jump between sections, not just the
    // visible text - it would fail against the pre-fix <p> markup because
    // getByRole("heading", ...) does not match a paragraph.
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    addCheckin(
      { date: utcDateKey(25), focus: "Fitness", dose: "light", minutes: 5, status: "done" },
      "guest",
    );
    addCheckin(
      { date: utcDateKey(1), focus: "Deep Work", dose: "deep", minutes: 30, status: "done" },
      "guest",
    );

    render(<TrendsPage />);

    await screen.findAllByTestId("trend-bucket");

    expect(screen.getByRole("heading", { level: 1, name: "Your last 4 weeks" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Weekly completion" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Focus areas across the window" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "What the last 4 weeks show" }),
    ).toBeTruthy();

    // No skipped levels: every heading on the page is h1 or h2, and there is
    // exactly one h1.
    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels.every((level) => level === 1 || level === 2)).toBe(true);
  });

  it("has exactly one heading (the h1) in the empty state, with no orphan subheadings", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    render(<TrendsPage />);

    expect(await screen.findByTestId("empty-state-insights")).toBeTruthy();

    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));
    expect(levels).toEqual([1]);
  });

  it("shows the narrative and dose/focus breakdowns once real history exists", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    addCheckin(
      { date: utcDateKey(1), focus: "Deep Work", dose: "deep", minutes: 30, status: "done" },
      "guest",
    );

    render(<TrendsPage />);

    await screen.findAllByTestId("trend-bucket");

    expect(screen.getByText("What the last 4 weeks show")).toBeTruthy();
    expect(screen.getByText("Deep sessions")).toBeTruthy();
  });

  it("reads a signed-in user's history exclusively through CheckinStoreAdapter, never a direct browser-checkins call", async () => {
    // This is the exact shape of the review/page.tsx bug filed in the
    // backlog: for a signed-in user resolved to the Firestore backend, a
    // direct browser-checkins.ts call reads an empty (or stale) local list
    // instead of the user's real Firestore history. Local storage here is
    // deliberately left empty to reproduce that exact trap; if Trends ever
    // regressed to reading listCheckins directly, this test would both see
    // the spy called AND see the empty state instead of real data.
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    vi.mocked(getFirestoreCheckinsInRange).mockResolvedValue([
      firestoreCheckin({ id: "f1", date: utcDateKey(2), focus: "Deep Work", status: "done" }),
      firestoreCheckin({ id: "f2", date: utcDateKey(9), focus: "Fitness", status: "done" }),
    ]);

    render(<TrendsPage />);

    await waitFor(() => {
      expect(screen.queryByTestId("empty-state-insights")).toBeNull();
    });

    expect(vi.mocked(getFirestoreCheckinsInRange)).toHaveBeenCalledWith(
      expect.anything(),
      28,
      undefined,
      "user-123",
    );
    expect(vi.mocked(listCheckins)).not.toHaveBeenCalled();

    const buckets = await screen.findAllByTestId("trend-bucket");
    const totalCompleted = buckets.reduce((sum, bucket) => {
      const countEl = within(bucket).getByTestId("trend-bucket-count");
      const match = countEl.textContent?.match(/^(\d+)\/(\d+) complete$/);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);
    expect(totalCompleted).toBe(2);
  });

  // v0.12 PR1 (docs/design/FOCUS_IN_TRENDS.md section 3.1): the focus card.
  // These are behavior-difference tests, not presence checks - each asserts a
  // NUMBER or a sentence derived from seeded store data, so a card that
  // rendered but was wired to nothing (the "shipped surface that silently does
  // nothing" class) fails them.
  it("surfaces this week's focus sessions from the real local focus store", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    addCheckin(
      { date: utcDateKey(1), focus: "Deep Work", dose: "deep", minutes: 30, status: "done" },
      "guest",
    );
    addFocusSession(
      { task: "draft the intro", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    addFocusSession(
      { task: "tidy inbox", plannedMinutes: 15, focusedSeconds: 600, outcome: "stopped-early" },
      "guest",
    );

    render(<TrendsPage />);

    const card = await screen.findByTestId("focus-week-card");
    expect(within(card).getByTestId("focus-week-sessions").textContent).toBe("2");
    // 1500s + 600s = 2100s -> 35 whole minutes.
    expect(within(card).getByTestId("focus-week-minutes").textContent).toBe("35");
    expect(within(card).getByTestId("focus-week-recap").textContent).toBe(
      "You focused through 2 sessions this week, 35 minutes in total.",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Focus sessions this week" }),
    ).toBeTruthy();
  });

  it("shows a neutral zero state when there are check-ins but no focus sessions", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    addCheckin(
      { date: utcDateKey(1), focus: "Deep Work", dose: "deep", minutes: 30, status: "done" },
      "guest",
    );

    render(<TrendsPage />);

    const card = await screen.findByTestId("focus-week-card");
    expect(within(card).getByTestId("focus-week-sessions").textContent).toBe("0");
    expect(within(card).getByTestId("focus-week-recap").textContent).toBe(
      "No focus sessions yet this week, and that's completely fine.",
    );
    // The calm bar: nothing on this card frames zero as a lapse.
    expect(card.textContent).not.toMatch(/streak|goal|target|rate|missed|failed|should/i);
  });

  it("stands alone for someone who has focused but never checked in", async () => {
    // Without this, the check-in empty state would swallow the whole page and
    // a person's real /now sessions would be invisible on the one screen that
    // exists to show them how their week went.
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    addFocusSession(
      { task: "read one chapter", plannedMinutes: 5, focusedSeconds: 300, outcome: "wrapped-up" },
      "guest",
    );

    render(<TrendsPage />);

    const card = await screen.findByTestId("focus-week-card");
    expect(within(card).getByTestId("focus-week-sessions").textContent).toBe("1");
    expect(within(card).getByTestId("focus-week-recap").textContent).toBe(
      "You focused through 1 session this week, 5 minutes in total.",
    );
    // The check-in empty state is untouched: the card is additive, not a
    // replacement for it.
    expect(screen.getByTestId("empty-state-insights")).toBeTruthy();
  });

  it("keeps the page a single calm empty state when there is neither kind of history", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(guestAuthMock as never);

    render(<TrendsPage />);

    expect(await screen.findByTestId("empty-state-insights")).toBeTruthy();
    expect(screen.queryByTestId("focus-week-card")).toBeNull();
  });

  // v0.12 PR2 (docs/design/FOCUS_IN_TRENDS.md section 5): a signed-in person's
  // sessions live in Firestore, so this page must read them through the
  // focus-session store adapter, never through focus-session.ts directly.
  // That is the same defect class as the review-page adapter bypass fixed in
  // PR #106, where a signed-in person's real history rendered as if it were
  // empty because the page read local storage.
  it("reads a signed-in person's focus sessions from Firestore, not local storage", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    vi.mocked(getFirestoreCheckinsInRange).mockResolvedValue([
      firestoreCheckin({ id: "f1", date: utcDateKey(2), focus: "Deep Work", status: "done" }),
    ]);
    // Local storage holds a DIFFERENT count under both the guest bucket and
    // this user's own bucket, so rendering "2" cannot happen by coincidence
    // from either local source: only the Firestore read produces it.
    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    addFocusSession(
      { task: "stale local copy", plannedMinutes: 5, focusedSeconds: 300, outcome: "wrapped-up" },
      "user-123",
    );
    vi.mocked(listFirestoreFocusSessions).mockResolvedValueOnce([
      firestoreFocusSession({ id: "s1", focusedSeconds: 900 }),
      firestoreFocusSession({ id: "s2", focusedSeconds: 900 }),
    ]);

    render(<TrendsPage />);

    const card = await screen.findByTestId("focus-week-card");
    await waitFor(() => {
      expect(within(card).getByTestId("focus-week-sessions").textContent).toBe("2");
    });
    expect(within(card).getByTestId("focus-week-minutes").textContent).toBe("30");
    // Scope isolation: reading the wrong uid would show another person's work.
    expect(vi.mocked(listFirestoreFocusSessions)).toHaveBeenCalledWith(
      expect.anything(),
      "user-123",
    );
  });

  it("falls back to that person's local sessions when the Firestore read fails", async () => {
    // The safety property the store promises, asserted at the page level: a
    // permission-denied or offline read must degrade to what this browser
    // has, never to a blank card that reads as "you did nothing this week".
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    vi.mocked(getFirestoreCheckinsInRange).mockResolvedValue([]);
    vi.mocked(listFirestoreFocusSessions).mockRejectedValueOnce(
      new Error("permission-denied"),
    );

    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    addFocusSession(
      { task: "their local work", plannedMinutes: 15, focusedSeconds: 900, outcome: "wrapped-up" },
      "user-123",
    );

    render(<TrendsPage />);

    const card = await screen.findByTestId("focus-week-card");
    await waitFor(() => {
      expect(within(card).getByTestId("focus-week-sessions").textContent).toBe("1");
    });
    // 900s under user-123, not the guest bucket's 1500s: the fallback keeps
    // the scope.
    expect(within(card).getByTestId("focus-week-minutes").textContent).toBe("15");
  });

  // v0.13 (docs/design/GUEST_DATA_MIGRATION.md section 3.2). /trends is the
  // screen where a stranded history is most visible - a zeroed focus card
  // reads as "you did nothing this week" - so the copy has to land before the
  // read that feeds the card, not merely somewhere on the page's timeline.
  it("shows a signed-in person the sessions they recorded signed out, in the same load", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );

    render(<TrendsPage />);

    const card = await screen.findByTestId("focus-week-card");
    // 1 session / 25 minutes can only render if the guest record reached the
    // user-123 scope BEFORE listFocusSessions ran. Sequencing the migration
    // after the read leaves this at "0" until the next visit.
    await waitFor(() => {
      expect(within(card).getByTestId("focus-week-sessions").textContent).toBe("1");
    });
    expect(within(card).getByTestId("focus-week-minutes").textContent).toBe("25");
    expect(screen.getByTestId("focus-migration-note").textContent).toBe(
      FOCUS_SESSION_COPY.migrationNote,
    );
    // D4: the guest copy survives.
    expect(listFocusSessions("guest")).toHaveLength(1);
  });

  // v0.21 PR2 (docs/design/STATUS_VOCABULARY.md D4), the /trends half of the
  // same defect: this page also rendered only the "ok" branch and only ever
  // SET "ok", so a copy that could not be made was silent here too. Observed
  // failing against origin/main before the fix landed. The injected failure is
  // the local storage write for the reason now-page.test.tsx records: a
  // rejected Firestore write falls back to the local migration and reports
  // "migrated", so it never reaches this branch.
  it("tells a signed-in person, assertively, when the copy could not be made", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    vi.mocked(getFirestoreCheckinsInRange).mockResolvedValue([]);
    addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    failWritesTo(ACCOUNT_SESSIONS_KEY);

    render(<TrendsPage />);

    const note = await screen.findByTestId("focus-migration-error");
    expect(note.textContent).toBe(FOCUS_SESSION_COPY.migrationErrorNote);
    expect(note.getAttribute("role")).toBe("alert");
    expect(note.getAttribute("aria-live")).toBe("assertive");
    expect(screen.queryByTestId("focus-migration-note")).toBeNull();
    // D4 of GUEST_DATA_MIGRATION: the guest copy survives a failed copy too.
    expect(listFocusSessions("guest")).toHaveLength(1);
  });

  it("stays silent for a signed-in person with nothing to bring across", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    vi.mocked(getFirestoreCheckinsInRange).mockResolvedValue([]);

    render(<TrendsPage />);

    expect(await screen.findByTestId("empty-state-insights")).toBeTruthy();
    expect(screen.queryByTestId("focus-migration-note")).toBeNull();
  });

  it("copies guest sessions into Firestore for a synced person, then reads them back", async () => {
    vi.mocked(useCoachAuth).mockReturnValue(signedInAuthMock as never);
    mockFirebase({} as Firestore);
    vi.mocked(getFirestoreCheckinsInRange).mockResolvedValue([]);
    const guestSession = addFocusSession(
      { task: "guest work", plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" },
      "guest",
    );
    vi.mocked(listFirestoreFocusSessions).mockResolvedValue([
      firestoreFocusSession({ id: guestSession.id, focusedSeconds: 1500 }),
    ]);

    render(<TrendsPage />);

    await waitFor(() => {
      expect(vi.mocked(putFirestoreFocusSession)).toHaveBeenCalledTimes(1);
    });
    const [, copied, scope] = vi.mocked(putFirestoreFocusSession).mock.calls[0];
    expect(copied.id).toBe(guestSession.id);
    expect(scope).toBe("user-123");
    // The card then renders from the Firestore read, which is the path a
    // second device would take.
    const card = await screen.findByTestId("focus-week-card");
    await waitFor(() => {
      expect(within(card).getByTestId("focus-week-sessions").textContent).toBe("1");
    });
  });
});

// Guards the test file's own mocking setup: if listCheckinsInRange or
// getFirestoreCheckinsInRange were ever accidentally left unmocked/unwired
// in a way that silently no-ops, every assertion above would pass for the
// wrong reason (an always-empty page trivially "not showing empty data it
// never bypassed to"). Confirms both are real, callable functions here.
describe("trends-page.test.tsx mock wiring sanity", () => {
  it("listCheckinsInRange is the real browser-checkins implementation, not replaced", () => {
    window.localStorage.clear();
    addCheckin(
      { date: utcDateKey(0), focus: "Deep Work", dose: "light", minutes: 5, status: "done" },
      "guest",
    );
    expect(listCheckinsInRange(28, undefined, "guest")).toHaveLength(1);
  });
});
