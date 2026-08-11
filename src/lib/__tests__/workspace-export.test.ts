/**
 * The behaviour half of the v0.29 export (D2).
 *
 * `src/__tests__/storage-key-census.test.ts` proves the manifest is COMPLETE by
 * reading it against every localStorage call site on disk. That is a token
 * match: it would still pass if `collectWorkspaceExport` returned `{}`.
 *
 * This suite proves the manifest is CORRECT, and it does so through the doors a
 * person actually uses: every store is seeded by calling its real public write
 * function (`saveJournalEntry`, `saveSlicedTasks`, `addCheckin`, ...), never by
 * writing a key this file spells out. A test that seeds the key it then asserts
 * on proves only that localStorage works.
 *
 * ONE STORE IS SEEDED THROUGH ITS MANIFEST ROW, AND SAYS SO
 * ---------------------------------------------------------
 * The theme has no exported writer: `theme-toggle.tsx` keeps
 * `THEME_STORAGE_KEY` module-private and writes it from a click handler, and
 * two more files in `src/app` spell the same literal inline. So its seed uses
 * the manifest's own key family, which would be circular on its own - what
 * removes the circularity is the census, which independently reads that family
 * out of `theme-toggle.tsx` and fails if the manifest and the component ever
 * disagree.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectWorkspaceExport,
  downloadWorkspaceExport,
  serializeWorkspaceExport,
  STORE_MANIFEST,
  storageKeyFor,
  workspaceExportFileName,
  WORKSPACE_EXPORT_MIME_TYPE,
} from "@/lib/workspace-export";
import { addCheckin } from "@/lib/browser-checkins";
import { saveChallengeProgress } from "@/lib/challenges";
import { addFocusSession } from "@/lib/focus-session";
import { guestMigrationMarker } from "@/lib/guest-migration";
import { saveJournalEntry } from "@/lib/journal";
import { setPlanInterest, trackMonetizationEvent } from "@/lib/monetization";
import { saveOnboardingPreferences } from "@/lib/onboarding";
import { persistPlannerState } from "@/lib/planner-state";
import { saveReminderPreferences } from "@/lib/reminder-preferences";
import { saveSlicedTasks, type SlicedTask } from "@/lib/slicer";

const SCOPE = "guest";
const OTHER_SCOPE = "account-42";
const NOW = new Date(2026, 7, 11, 9, 30, 0, 0);

function manifestEntry(id: string) {
  const entry = STORE_MANIFEST.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`no manifest entry with id "${id}"`);
  }
  return entry;
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function slicedTask(title: string): SlicedTask {
  return {
    id: "task-1",
    title,
    domain: "general",
    intimidation: "medium",
    steps: [{ id: "step-1", text: "Open the drawer", minutes: 2, completed: false }],
    createdAt: "2026-08-11T09:00:00.000Z",
  };
}

/** Seeds every store through its real writer, for one scope. */
function seedWorkspace(scope: string, marker: string) {
  persistPlannerState(scope, {
    focus: "Deep Work",
    dose: "medium",
    notes: `notes for ${scope}`,
    email: "",
    plan: null,
    checkedIn: null,
  });
  addCheckin({ date: "2026-08-11", focus: "Deep Work", dose: "medium", minutes: 20, status: "done" }, scope);
  addFocusSession({ task: marker, plannedMinutes: 25, focusedSeconds: 1500, outcome: "wrapped-up" }, scope);
  saveJournalEntry("2026-08-11", `journal for ${scope}`, scope);
  saveSlicedTasks([slicedTask(marker)], scope);
  saveReminderPreferences(scope, { enabled: true, time: "18:30", channel: "browser" });
  window.localStorage.setItem(guestMigrationMarker(scope, "local", "slicer"), "1");
}

/** Seeds the stores that are one-per-browser rather than one-per-person. */
function seedGlobalStores() {
  saveChallengeProgress({ completedIds: ["focus-001"], lastCompletedDate: "2026-08-11" });
  saveOnboardingPreferences({ defaultFocus: "Mindfulness", defaultDose: "light", defaultTheme: "dark" });
  setPlanInterest("pro");
  trackMonetizationEvent("pricing_cta_clicked", "pro", "pricing");
  window.localStorage.setItem(storageKeyFor(manifestEntry("theme"), SCOPE), "dark");
}

describe("collectWorkspaceExport", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns every manifest store, seeded through the app's own write functions", () => {
    seedWorkspace(SCOPE, "guest-task");
    seedGlobalStores();

    const workspace = collectWorkspaceExport({ scope: SCOPE, now: NOW });

    expect(
      Object.keys(workspace.stores).sort(),
      "a store the manifest declares did not survive the round trip: it was written by its " +
        "own public writer and the collector did not read it back",
    ).toEqual(STORE_MANIFEST.map((entry) => entry.id).sort());
  });

  it("returns the values that were written, not merely the keys", () => {
    seedWorkspace(SCOPE, "guest-task");
    seedGlobalStores();

    const { stores } = collectWorkspaceExport({ scope: SCOPE, now: NOW });

    expect((stores.planner.value as { notes: string }).notes).toBe("notes for guest");
    expect((stores.checkins.value as { minutes: number }[])[0].minutes).toBe(20);
    expect((stores["focus-sessions"].value as { task: string }[])[0].task).toBe("guest-task");
    expect((stores.journal.value as { text: string }[])[0].text).toBe("journal for guest");
    expect((stores.slicer.value as SlicedTask[])[0].title).toBe("guest-task");
    expect((stores.challenges.value as { completedIds: string[] }).completedIds).toEqual(["focus-001"]);
    expect((stores.onboarding.value as { defaultTheme: string }).defaultTheme).toBe("dark");
    expect((stores["reminder-preferences"].value as { time: string }).time).toBe("18:30");
    expect((stores["monetization-events"].value as { name: string }[])[0].name).toBe(
      "pricing_cta_clicked",
    );
  });

  it("keeps a bare string value as a string rather than dropping it", () => {
    // Three families store a bare value rather than JSON. A collector that
    // assumed JSON would either throw or silently omit them.
    seedGlobalStores();
    seedWorkspace(SCOPE, "guest-task");

    const { stores } = collectWorkspaceExport({ scope: SCOPE, now: NOW });

    expect(stores.theme.value).toBe("dark");
    expect(stores["plan-interest"].value).toBe("pro");
    expect(
      Object.values(stores["guest-migration-markers"].value as Record<string, unknown>),
    ).toEqual([1]);
  });

  it("collects every migration marker of the current scope under one store", () => {
    window.localStorage.setItem(guestMigrationMarker(SCOPE, "local", "slicer"), "1");
    window.localStorage.setItem(guestMigrationMarker(SCOPE, "firestore", "journal"), "1");

    const { stores } = collectWorkspaceExport({ scope: SCOPE, now: NOW });
    const markers = stores["guest-migration-markers"].value as Record<string, unknown>;

    expect(Object.keys(markers).sort()).toEqual([
      guestMigrationMarker(SCOPE, "firestore", "journal"),
      guestMigrationMarker(SCOPE, "local", "slicer"),
    ].sort());
  });

  it("exports the current scope only, never another account in the same browser (D8)", () => {
    seedWorkspace(SCOPE, "guest-task");
    seedWorkspace(OTHER_SCOPE, "account-task");

    const workspace = collectWorkspaceExport({ scope: OTHER_SCOPE, now: NOW });
    const serialized = serializeWorkspaceExport(workspace);

    expect((workspace.stores.planner.value as { notes: string }).notes).toBe(`notes for ${OTHER_SCOPE}`);
    expect(
      serialized,
      "the export of one scope carried another scope's contents; on a shared laptop that turns " +
        "a convenience feature into a disclosure",
    ).not.toContain("guest-task");
    expect(serialized).not.toContain("notes for guest");
  });

  it("never carries a key the manifest does not declare", () => {
    // The rejected alternative in D1 was "iterate localStorage and take every
    // key with our prefix". This is the assertion that would have caught it:
    // the browser is shared with other libraries, and one of them here writes a
    // key that looks close enough to ours to be swept up by a prefix rule.
    seedWorkspace(SCOPE, "guest-task");
    window.localStorage.setItem("some-other-library:session", "secret-token");
    window.localStorage.setItem("calm-daily-coach-unclaimed:guest", "not-in-the-manifest");

    const serialized = serializeWorkspaceExport(collectWorkspaceExport({ scope: SCOPE, now: NOW }));

    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("not-in-the-manifest");
  });

  it("omits a store this browser holds nothing for", () => {
    saveSlicedTasks([slicedTask("only-this")], SCOPE);

    const { stores } = collectWorkspaceExport({ scope: SCOPE, now: NOW });

    expect(Object.keys(stores)).toEqual(["slicer"]);
  });

  it("labels every store with its manifest label and kind", () => {
    seedWorkspace(SCOPE, "guest-task");
    seedGlobalStores();

    const { stores } = collectWorkspaceExport({ scope: SCOPE, now: NOW });

    for (const entry of STORE_MANIFEST) {
      expect(stores[entry.id].label).toBe(entry.label);
      expect(stores[entry.id].kind).toBe(entry.kind);
    }
  });

  it("stamps an envelope that says where the data came from", () => {
    const workspace = collectWorkspaceExport({ scope: SCOPE, now: NOW });

    expect(workspace.app).toBe("ADHD Daily Coach");
    expect(workspace.formatVersion).toBe(1);
    expect(workspace.source).toBe("this browser");
    expect(workspace.scope).toBe(SCOPE);
    expect(workspace.exportedAt).toBe(NOW.toISOString());
  });

  it("returns an empty workspace rather than throwing when there is no storage", () => {
    const workspace = collectWorkspaceExport({ scope: SCOPE, storage: null, now: NOW });

    expect(workspace.stores).toEqual({});
    expect(workspace.scope).toBe(SCOPE);
  });
});

describe("workspaceExportFileName", () => {
  it("names the file for the local day it was taken", () => {
    expect(workspaceExportFileName(NOW)).toBe("adhd-daily-coach-workspace-2026-08-11.json");
    expect(workspaceExportFileName(new Date(2026, 0, 5))).toBe(
      "adhd-daily-coach-workspace-2026-01-05.json",
    );
  });
});

describe("downloadWorkspaceExport", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("hands the browser a JSON blob named for today and revokes the URL", async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:workspace-export");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    let downloadName = "";
    let downloadHref = "";
    vi.spyOn(HTMLElement.prototype, "click").mockImplementation(function (this: HTMLElement) {
      const anchor = this as HTMLAnchorElement;
      downloadName = anchor.download;
      downloadHref = anchor.href;
    });

    saveSlicedTasks([slicedTask("downloaded-task")], SCOPE);

    expect(downloadWorkspaceExport({ scope: SCOPE, now: NOW })).toBe(true);
    expect(downloadName).toBe("adhd-daily-coach-workspace-2026-08-11.json");
    expect(downloadHref).toContain("blob:workspace-export");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-export");
    expect(document.querySelector("a[download]")).toBeNull();

    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe(WORKSPACE_EXPORT_MIME_TYPE);

    // The file itself, parsed rather than pattern-matched: this is the shape
    // PR2's chromium spec will read off a real download. Read through
    // FileReader because jsdom 24's Blob has no `text()`.
    const parsed = JSON.parse(await readBlobText(blob)) as ReturnType<typeof collectWorkspaceExport>;
    expect(parsed.app).toBe("ADHD Daily Coach");
    expect((parsed.stores.slicer.value as SlicedTask[])[0].title).toBe("downloaded-task");
  });
});
