/**
 * The workspace export: everything this browser holds for one person, in one
 * file they can keep (v0.29 PR1, `docs/design/WORKSPACE_EXPORT.md`).
 *
 * This module is the MANIFEST and the FILE. It has no UI: the panel that calls
 * it is v0.29 PR2 (D9).
 *
 * WHY THE MANIFEST IS DECLARED RATHER THAN DISCOVERED (D1)
 * --------------------------------------------------------
 * The obvious implementation is to iterate `window.localStorage` and take every
 * key starting with `calm-daily-coach`. It is fewer lines and it is wrong three
 * times over, and each way is visible in the table below rather than
 * hypothetical:
 *
 * 1. It DROPS `focus-adhd-coach:slicer`, a fossil of the app's "Focus" era that
 *    is frozen on purpose (renaming it would orphan real slicer history). The
 *    one store a prefix rule loses is the one the product names a route after.
 * 2. It SWALLOWS siblings. The planner's key family is the bare string
 *    `calm-daily-coach`, and its scoped key is `calm-daily-coach:<scope>` - the
 *    same shape as `calm-daily-coach:challenges`, `:theme`, `:onboarding`,
 *    `:plan-interest`, `:monetization-events` and `:reminder-prefs:<scope>`. A
 *    prefix walk for "the planner" collects six other stores; an exact key does
 *    not. That is why `scoping: "scoped"` reads ONE key rather than scanning.
 * 3. It has nowhere to record that a key was considered and deliberately left
 *    out, which is what `EXCLUDED_KEYS` is for.
 *
 * A declared list makes every store a one-field decision. The same argument
 * `src/lib/routes.ts` records for `navSlot`: a declared field cannot be changed
 * by accident, a positional or pattern rule can.
 *
 * WHAT KEEPS THE MANIFEST HONEST
 * ------------------------------
 * Two suites, and neither is sufficient alone (D2):
 *
 * - `src/__tests__/storage-key-census.test.ts` reads this manifest against
 *   every `localStorage.` call site in the shipped tree and fails when a module
 *   writes a key family this file neither carries nor excludes. It proves the
 *   manifest is COMPLETE. On its own it is a token match a comment could
 *   satisfy.
 * - `src/lib/__tests__/workspace-export.test.ts` seeds a jsdom `localStorage`
 *   through each store's real public write function and asserts
 *   `collectWorkspaceExport` returns what was written. It proves the manifest
 *   is CORRECT. On its own it cannot notice a store nobody remembered.
 */

import { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";

/**
 * What a reader is looking at, so they can draw the line themselves rather than
 * have the app draw it for them (D4).
 *
 * - `content`: things the person wrote or did - journal entries, sliced tasks,
 *   check-ins, focus sessions, today's plan, challenge progress.
 * - `preference`: how they asked the app to behave - theme, reminders,
 *   onboarding answers.
 * - `record`: things the app wrote ABOUT them - migration markers, plan
 *   interest, monetization events.
 *
 * Everything in the manifest is exported, `record` entries included. Quietly
 * dropping the app's own instrumentation because it is "not really your data"
 * is a small dishonesty of exactly the shape v0.28 removed from `/`.
 */
export type StoreKind = "content" | "preference" | "record";

/**
 * How a concrete localStorage key is built from a key family.
 *
 * - `global`: the family IS the key. One value per browser.
 * - `scoped`: the key is `<family>:<scope>` exactly. One value per person.
 * - `scoped-prefix`: every key beginning `<family>:<scope>:` belongs to this
 *   family. Used by the guest-migration markers, which mint one key per
 *   (scope, backend, collection) triple.
 */
export type StoreScoping = "global" | "scoped" | "scoped-prefix";

export type StoreManifestEntry = {
  /** Stable id, used as the key inside the export envelope's `stores` object. */
  id: string;
  /**
   * The key family: the whole key for a `global` store, the part before
   * `:<scope>` for the other two.
   */
  keyFamily: string;
  /**
   * Repo-relative module that DECLARES the key literal. The census asserts this
   * file really contains it, so an entry cannot name a module at random.
   */
  declaredIn: string;
  /** What a person would call this, in the file itself. */
  label: string;
  kind: StoreKind;
  scoping: StoreScoping;
};

/**
 * Every localStorage key family this app writes. Twelve of them, one row per
 * family, read off the tree rather than off a changelog.
 *
 * Adding a store means adding a row here. That is the point: the census fails
 * the build until the row exists.
 */
export const STORE_MANIFEST: readonly StoreManifestEntry[] = [
  {
    id: "planner",
    keyFamily: "calm-daily-coach",
    declaredIn: "src/lib/planner-state.ts",
    label: "Today's plan",
    kind: "content",
    scoping: "scoped",
  },
  {
    id: "checkins",
    keyFamily: "calm-daily-coach-checkins",
    declaredIn: "src/lib/browser-checkins.ts",
    label: "Check-ins",
    kind: "content",
    scoping: "scoped",
  },
  {
    id: "focus-sessions",
    keyFamily: "calm-daily-coach-focus-sessions",
    declaredIn: "src/lib/focus-session.ts",
    label: "Focus sessions",
    kind: "content",
    scoping: "scoped",
  },
  {
    id: "journal",
    keyFamily: "calm-daily-coach-journal",
    declaredIn: "src/lib/journal.ts",
    label: "Journal entries",
    kind: "content",
    scoping: "scoped",
  },
  {
    id: "slicer",
    keyFamily: "focus-adhd-coach:slicer",
    declaredIn: "src/lib/slicer.ts",
    label: "Sliced tasks",
    kind: "content",
    scoping: "scoped",
  },
  {
    // Progress, not a streak: the id list and the last date, nothing that
    // punishes a gap. Classified `content` because it records what the person
    // actually did, which D4's list starts with; `record` is for what the app
    // wrote about them.
    id: "challenges",
    keyFamily: "calm-daily-coach:challenges",
    declaredIn: "src/lib/challenges.ts",
    label: "Challenge progress",
    kind: "content",
    scoping: "global",
  },
  {
    // The one key in this table that is IMPORTED rather than spelled, because
    // it is the one key that already has a one-home rule:
    // `src/__tests__/onboarding-storage-contract.test.ts` fails when a second
    // shipped module spells it, after that record ended up with three different
    // validation contracts. The other eleven modules keep their key constant
    // private, so their rows carry the literal and the census is what holds
    // each literal to the tree that writes it.
    id: "onboarding",
    keyFamily: ONBOARDING_STORAGE_KEY,
    declaredIn: "src/lib/onboarding.ts",
    label: "Onboarding answers",
    kind: "preference",
    scoping: "global",
  },
  {
    id: "reminder-preferences",
    keyFamily: "calm-daily-coach:reminder-prefs",
    declaredIn: "src/lib/reminder-preferences.ts",
    label: "Reminder settings",
    kind: "preference",
    scoping: "scoped",
  },
  {
    // Declared in a component rather than in `src/lib`, which is exactly why
    // the census walks `src/app` too and anchors itself on this key.
    id: "theme",
    keyFamily: "calm-daily-coach:theme",
    declaredIn: "src/app/components/theme-toggle.tsx",
    label: "Theme",
    kind: "preference",
    scoping: "global",
  },
  {
    id: "plan-interest",
    keyFamily: "calm-daily-coach:plan-interest",
    declaredIn: "src/lib/monetization.ts",
    label: "Plan interest",
    kind: "record",
    scoping: "global",
  },
  {
    id: "monetization-events",
    keyFamily: "calm-daily-coach:monetization-events",
    declaredIn: "src/lib/monetization.ts",
    label: "Pricing interactions",
    kind: "record",
    scoping: "global",
  },
  {
    id: "guest-migration-markers",
    keyFamily: "calm-daily-coach-migrated-guest",
    declaredIn: "src/lib/guest-migration.ts",
    label: "Guest migration markers",
    kind: "record",
    scoping: "scoped-prefix",
  },
];

/**
 * A key family this app writes and the export deliberately leaves out.
 *
 * DELIBERATELY EMPTY TODAY, and that is a statement rather than an oversight:
 * every one of the twelve families above is exported, `record` kinds included
 * (D4). The list exists so the next store that should NOT be in the file is
 * left out with a reason attached, instead of being forgotten - which is
 * indistinguishable from being left out on purpose, and is the failure mode the
 * census was written for.
 *
 * The census's per-entry checks are therefore vacuous while this array is
 * empty. What is NOT vacuous is the completeness rule they support: source A is
 * `STORE_MANIFEST` UNION this list, and a family found on disk that is in
 * neither fails the suite.
 */
export type ExcludedKey = {
  keyFamily: string;
  /** Repo-relative module that declares the key literal. */
  declaredIn: string;
  /** Why it is not in the file. Asserted non-empty. */
  reason: string;
};

export const EXCLUDED_KEYS: readonly ExcludedKey[] = [];

/** One store as it appears in the exported file. */
export type WorkspaceExportStore = {
  label: string;
  kind: StoreKind;
  /**
   * The stored value, JSON-parsed when it parses. Three families store a bare
   * string rather than JSON (the theme name, the plan-interest tier, and `"1"`
   * for a migration marker), so a parse failure is normal and the raw string is
   * kept rather than dropped.
   *
   * For a `scoped-prefix` family this is an object keyed by the full
   * localStorage key, because one family can hold several keys at once.
   */
  value: unknown;
};

/**
 * The envelope. `formatVersion` exists so a future importer has something to
 * branch on; it is a number in a file, not a promise (D7).
 */
export type WorkspaceExport = {
  app: "ADHD Daily Coach";
  formatVersion: 1;
  exportedAt: string;
  source: "this browser";
  /** The scope key the export was taken for: `"guest"` or an account id. */
  scope: string;
  stores: Record<string, WorkspaceExportStore>;
};

export const WORKSPACE_EXPORT_FORMAT_VERSION = 1;

export type CollectWorkspaceExportOptions = {
  /**
   * The scope the person is currently in, and ONLY that scope (D8). One browser
   * can hold a guest workspace beside one or more signed-in workspaces;
   * exporting all of them would hand whoever clicks the button the contents of
   * every account that ever signed in on a shared laptop.
   */
  scope: string;
  /** Defaults to `window.localStorage`. Injected by the tests. */
  storage?: Storage | null;
  /** Defaults to now. Injected by the tests so `exportedAt` is assertable. */
  now?: Date;
};

/** The concrete key an exact-read family uses for one scope. */
export function storageKeyFor(entry: StoreManifestEntry, scope: string): string {
  return entry.scoping === "global" ? entry.keyFamily : `${entry.keyFamily}:${scope}`;
}

/** The prefix every key of a `scoped-prefix` family starts with, for one scope. */
export function storageKeyPrefixFor(entry: StoreManifestEntry, scope: string): string {
  return `${entry.keyFamily}:${scope}:`;
}

function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

/** JSON when it is JSON, the raw string when it is not. Never throws. */
function readValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function collectPrefixFamily(
  storage: Storage,
  entry: StoreManifestEntry,
  scope: string,
): Record<string, unknown> | null {
  const prefix = storageKeyPrefixFor(entry, scope);
  const found: Record<string, unknown> = {};

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(prefix)) {
      continue;
    }

    const raw = storage.getItem(key);
    if (raw !== null) {
      found[key] = readValue(raw);
    }
  }

  return Object.keys(found).length > 0 ? found : null;
}

/**
 * Everything this browser holds for `scope`, ready to be serialized.
 *
 * A store the browser does not hold is OMITTED rather than rendered as an empty
 * one: "we have nothing here for you" and "you never wrote anything here" are
 * the same fact for a person, and an empty shape would suggest structure that
 * does not exist. Which stores CAN appear is the manifest above, which the
 * census holds to the shipped tree.
 *
 * Only the declared families are read, so a key some other library shares this
 * browser with is never in the file - the export cannot leak what it never
 * looks at.
 */
export function collectWorkspaceExport(options: CollectWorkspaceExportOptions): WorkspaceExport {
  const { scope, now = new Date() } = options;
  const storage = resolveStorage(options.storage);
  const stores: Record<string, WorkspaceExportStore> = {};

  if (storage) {
    for (const entry of STORE_MANIFEST) {
      if (entry.scoping === "scoped-prefix") {
        const value = collectPrefixFamily(storage, entry, scope);
        if (value !== null) {
          stores[entry.id] = { label: entry.label, kind: entry.kind, value };
        }
        continue;
      }

      const raw = storage.getItem(storageKeyFor(entry, scope));
      if (raw !== null) {
        stores[entry.id] = { label: entry.label, kind: entry.kind, value: readValue(raw) };
      }
    }
  }

  return {
    app: "ADHD Daily Coach",
    formatVersion: WORKSPACE_EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    source: "this browser",
    scope,
    stores,
  };
}

/** `adhd-daily-coach-workspace-YYYY-MM-DD.json`, local date (D7). */
export function workspaceExportFileName(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `adhd-daily-coach-workspace-${year}-${month}-${day}.json`;
}

/** Indented so the file is readable by the person who downloaded it. */
export function serializeWorkspaceExport(workspace: WorkspaceExport): string {
  return `${JSON.stringify(workspace, null, 2)}\n`;
}

export const WORKSPACE_EXPORT_MIME_TYPE = "application/json;charset=utf-8";

/**
 * Builds the file and hands it to the browser as a download. Returns true when
 * a download was triggered.
 *
 * The Blob -> object URL -> anchor -> revoke sequence is the one
 * `src/lib/reminder-ics.ts:216-220` already uses for the calendar file, reused
 * rather than reinvented. No network is involved; the file never leaves the
 * device.
 */
export function downloadWorkspaceExport(options: CollectWorkspaceExportOptions): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const now = options.now ?? new Date();
  const workspace = collectWorkspaceExport({ ...options, now });
  const blob = new Blob([serializeWorkspaceExport(workspace)], {
    type: WORKSPACE_EXPORT_MIME_TYPE,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = workspaceExportFileName(now);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
