import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import {
  addFirestoreFocusSession,
  listFirestoreFocusSessions,
} from "@/lib/firestore-focus-sessions";

// Unlike focus-session-store.test.ts (which mocks this whole module out),
// these tests exercise the real listFirestoreFocusSessions /
// addFirestoreFocusSession bodies against a mocked firebase/firestore client
// SDK, since that is the only way to prove the field-validation check inside
// listFirestoreFocusSessions actually runs. Mirrors firestore-journal.test.ts.
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
// These three only need their ARGUMENTS recorded (the collection path and the
// ordering are what the tests assert), so they record and return an opaque
// handle rather than pretending to be real SDK builders.
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => {
    mockCollection(...args);
    return {};
  },
  doc: (...args: unknown[]) => {
    mockDoc(...args);
    return {};
  },
  orderBy: (...args: unknown[]) => {
    mockOrderBy(...args);
    return {};
  },
  query: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));

function docSnapshot(data: unknown) {
  return { data: () => data };
}

const wellFormed = {
  id: "session-1",
  task: "Draft the intro paragraph",
  plannedMinutes: 15,
  focusedSeconds: 900,
  outcome: "wrapped-up",
  date: "2026-07-25",
  createdAt: "2026-07-25T09:00:00.000Z",
};

describe("firestore-focus-sessions", () => {
  const db = {} as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns well-formed sessions unchanged", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [docSnapshot(wellFormed)] });

    const sessions = await listFirestoreFocusSessions(db, "user-123");

    expect(sessions).toEqual([wellFormed]);
  });

  it("reads the per-user focusSessions subcollection in append order", async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    await listFirestoreFocusSessions(db, "user-123");

    // The path is the security boundary: a wrong collection name would be
    // denied by the rules doc's match block, and a wrong uid segment would
    // read another person's sessions.
    expect(mockCollection).toHaveBeenCalledWith(
      db,
      "users",
      "user-123",
      "focusSessions",
    );
    expect(mockOrderBy).toHaveBeenCalledWith("createdAt", "asc");
  });

  it("skips malformed documents instead of returning them with missing or non-numeric fields", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        docSnapshot(wellFormed),
        // Missing "id" (a partially failed write).
        docSnapshot({ ...wellFormed, id: undefined }),
        // Missing "date": summarizeFocusSessions buckets by date, so this
        // would land in no bucket and quietly disappear from every total.
        docSnapshot({ ...wellFormed, date: undefined }),
        // Missing "outcome".
        docSnapshot({ ...wellFormed, outcome: "" }),
        // focusedSeconds present but a STRING (e.g. a console edit): the
        // summary sums this field, so it would turn the whole week's minutes
        // into NaN rather than failing loudly.
        docSnapshot({ ...wellFormed, focusedSeconds: "900" }),
        docSnapshot({ ...wellFormed, focusedSeconds: Number.NaN }),
      ],
    });

    const sessions = await listFirestoreFocusSessions(db, "user-123");

    expect(sessions).toEqual([wellFormed]);
  });

  it("writes a session with a generated id as the document id", async () => {
    const stored = await addFirestoreFocusSession(
      db,
      {
        task: "Draft the intro paragraph",
        plannedMinutes: 15,
        focusedSeconds: 900,
        outcome: "wrapped-up",
      },
      "user-123",
    );

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(stored.id).toBeTruthy();
    expect(stored.task).toBe("Draft the intro paragraph");
    expect(stored.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stored.createdAt).toBeTruthy();
    // Append-only contract: the session id IS the document id, so a retried
    // write lands on the same document instead of duplicating the session.
    expect(mockDoc).toHaveBeenCalledWith(
      db,
      "users",
      "user-123",
      "focusSessions",
      stored.id,
    );
    expect(mockSetDoc).toHaveBeenCalledWith(expect.anything(), stored);
  });
});

// docs/design/FOCUS_IN_TRENDS.md section 5 requires that the rules doc's field
// list matches the FocusSession type in code. A one-time reconciliation would
// be true only on the day it was written: this reads BOTH sources every run,
// so adding a field to the type without documenting it (or documenting a field
// that no longer exists) fails CI instead of silently shipping a ruleset that
// describes data the app does not store.
describe("FIRESTORE_RULES.md documents the real FocusSession shape", () => {
  const ROOT = process.cwd();
  const rulesDoc = readFileSync(
    path.join(ROOT, "docs", "FIRESTORE_RULES.md"),
    "utf-8",
  );
  const typeSource = readFileSync(
    path.join(ROOT, "src", "lib", "focus-session.ts"),
    "utf-8",
  );

  function documentedFields(): string[] {
    // Anchored on the list BULLET specifically (leading "- `"), not on any
    // mention of the path: the status paragraph names the same path, and
    // slicing from there would pick up the account document's field list
    // instead - which is exactly what the first draft of this guard did.
    const bulletStart = rulesDoc.indexOf("- `users/{uid}/focusSessions/{sessionId}`");
    expect(bulletStart, "the focusSessions path needs a documented bullet").toBeGreaterThan(-1);
    const bullet = rulesDoc.slice(bulletStart);
    const start = bullet.indexOf("(fields:");
    expect(start, "the focusSessions bullet must carry a `(fields: ...)` list").toBeGreaterThan(-1);
    const list = bullet.slice(start, bullet.indexOf(")", start));
    return [...list.matchAll(/`(\w+)`/g)].map((match) => match[1]);
  }

  function typeFields(): string[] {
    const start = typeSource.indexOf("export type FocusSession = {");
    expect(start, "FocusSession type not found").toBeGreaterThan(-1);
    const block = typeSource.slice(start, typeSource.indexOf("\n};", start));
    // Field lines only: two-space indent, an identifier, a colon. Doc-comment
    // lines start with `*` and never match.
    return [...block.matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]);
  }

  it("documents every field the type declares, and no field it does not", () => {
    const documented = documentedFields();
    const declared = typeFields();

    expect(declared.length).toBeGreaterThan(0);
    expect([...documented].sort()).toEqual([...declared].sort());
  });

  it("grants read+create but never update or delete on focusSessions", () => {
    // The append-only posture is a product property (a recorded session is
    // never rewritten into a judgement), so it is asserted, not just prose.
    const marker = "match /focusSessions/{sessionId} {";
    const blockStart = rulesDoc.indexOf(marker);
    expect(blockStart, "the ruleset needs a focusSessions match block").toBeGreaterThan(-1);
    const block = rulesDoc.slice(blockStart + marker.length);
    // Cut at the block's own closing brace (6-space indent inside the
    // ruleset), not at the "}" that closes "{sessionId}" in the marker.
    const rules = block.slice(0, block.indexOf("\n      }"));

    expect(rules).toContain("allow read, create: if isOwner(uid);");
    expect(rules).toContain("allow update, delete: if false;");
  });
});
