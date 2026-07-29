import {
  GUEST_SCOPE_KEY,
  guestMigrationMarker,
  migrateGuestSingleRecord,
  type GuestMigrationResult,
} from "@/lib/guest-migration";
import { readOnboardingDefaults } from "@/lib/onboarding";
import { DOSE_OPTIONS, FOCUS_AREAS, type DailyDose, type DailyPlan, type FocusArea } from "@/lib/plan";

/**
 * FROZEN LEGACY KEY NAMESPACE - do not "tidy" this to match the product name.
 *
 * The app was renamed (Calm Daily Coach -> Focus -> ADHD Daily Coach), but the
 * `calm-daily-coach` localStorage prefix was deliberately KEPT. These keys are
 * persisted user data: planner state, journal entries, challenges, focus
 * sessions, reminder preferences, theme, onboarding and guest-migration
 * markers. Renaming any of them does not migrate anything, it silently
 * orphans it, so every existing user loses their plans and history with no
 * error and no failing test (a repo-wide find-and-replace would rewrite the
 * assertions too).
 *
 * The same frozen prefix appears in browser-checkins.ts, challenges.ts,
 * focus-session.ts, guest-migration.ts, journal.ts, monetization.ts,
 * onboarding.ts, reminder-preferences.ts, components/theme-toggle.tsx and the
 * pre-hydration theme script in app/layout.tsx. If the namespace is ever
 * really to change, it needs a read-old/write-new migration, not a rename.
 *
 * Note this literal is BARE and identical to the old repo slug, which is
 * exactly what makes a blanket slug replace so dangerous here.
 */
const STORAGE_KEY = "calm-daily-coach";

export type SavedPlannerState = {
  focus: FocusArea;
  dose: DailyDose;
  notes: string;
  email: string;
  plan: DailyPlan | null;
  checkedIn: CheckedInRecord | null;
};

/**
 * Today's check-in outcome, persisted alongside the plan so the dashboard
 * ring survives a reload (cdc bug: checkinStatus used to live only in
 * useState, so a refresh always dropped a completed loop back to 50 percent).
 * Scoped to a single date the same way `plan` is: a stale record from a
 * previous day is dropped on read, matching the plan's own staleness rule.
 */
export type CheckedInRecord = {
  date: string;
  status: "done" | "skipped";
};

export function scopedPlannerStorageKey(scopeKey: string): string {
  return `${STORAGE_KEY}:${scopeKey}`;
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function plannerFallbackState(): SavedPlannerState {
  return {
    focus: "Deep Work",
    dose: "light",
    notes: "",
    email: "",
    plan: null,
    checkedIn: null,
  };
}

/**
 * Seeds the starting focus and dose from onboarding, field by field: a record
 * that only names a focus still sets the focus. The read itself lives in
 * `@/lib/onboarding` next to the storage key, so this module no longer keeps a
 * second copy of the key or a second parse of the same record.
 */
function applyOnboardingDefaults(state: SavedPlannerState): SavedPlannerState {
  const defaults = readOnboardingDefaults();

  return {
    ...state,
    focus: defaults.defaultFocus ?? state.focus,
    dose: defaults.defaultDose ?? state.dose,
  };
}

export function getInitialPlannerState(scopeKey: string): SavedPlannerState {
  const fallback = applyOnboardingDefaults(plannerFallbackState());

  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(scopedPlannerStorageKey(scopeKey));
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as {
      focus?: FocusArea;
      dose?: DailyDose;
      notes?: string;
      email?: string;
      plan?: DailyPlan;
      checkedIn?: CheckedInRecord;
    };

    const today = todayDateKey();
    const checkedInStatusValid =
      parsed.checkedIn?.status === "done" || parsed.checkedIn?.status === "skipped";

    return {
      focus:
        parsed.focus && FOCUS_AREAS.includes(parsed.focus)
          ? parsed.focus
          : fallback.focus,
      dose:
        parsed.dose && DOSE_OPTIONS.includes(parsed.dose)
          ? parsed.dose
          : fallback.dose,
      notes: typeof parsed.notes === "string" ? parsed.notes : fallback.notes,
      email: typeof parsed.email === "string" ? parsed.email : fallback.email,
      plan: parsed.plan?.date === today ? parsed.plan : fallback.plan,
      checkedIn:
        parsed.checkedIn?.date === today && checkedInStatusValid
          ? parsed.checkedIn
          : fallback.checkedIn,
    };
  } catch {
    window.localStorage.removeItem(scopedPlannerStorageKey(scopeKey));
    return fallback;
  }
}

export function persistPlannerState(scopeKey: string, state: SavedPlannerState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(scopedPlannerStorageKey(scopeKey), JSON.stringify(state));
}

/**
 * A scope's planner state as the app itself would read it, or `null` when
 * nothing live remains after the staleness read. `getInitialPlannerState`
 * already drops a `plan` and a `checkedIn` record from a previous day, so a
 * blob holding neither has nothing the ring or the planner would show: for
 * migration purposes it does not count as a record at all. This is what makes
 * "a stale account blob counts as absent" (D3) the same rule as the read
 * side, rather than a second, drifting definition of staleness.
 */
function livePlannerState(scopeKey: string): SavedPlannerState | null {
  const state = getInitialPlannerState(scopeKey);
  return state.plan !== null || state.checkedIn !== null ? state : null;
}

/**
 * Copies live same-day guest planner state into the account scope on sign-in
 * (v0.17 PR2, docs/design/GUEST_WORKSPACE_MIGRATION.md). Without this, the
 * check-in RECORD crosses over via `migrateGuestCheckins` but the dashboard
 * ring reads `SavedPlannerState.checkedIn` from the scope-keyed blob that
 * does not, so a guest who checks in and then signs in watches their
 * completed day drop back to 50 percent (the PR #90 defect class at the
 * sign-in boundary).
 *
 * Account wins, whole-blob, non-destructive: the guest blob is copied ONLY
 * when the account scope has no live same-day state of its own, and the
 * guest copy is never deleted. The backend segment of the marker is a
 * literal "local" because this store has no backend resolution (D6: no
 * Firestore surface here).
 */
export function migrateGuestPlannerState(
  targetScopeKey: string,
): Promise<GuestMigrationResult> {
  return migrateGuestSingleRecord<SavedPlannerState>(
    {
      markerKey: guestMigrationMarker(targetScopeKey, "local", "planner"),
      readGuestRecord: () => livePlannerState(GUEST_SCOPE_KEY),
      hasAccountRecord: async () => livePlannerState(targetScopeKey) !== null,
      write: async (state) => persistPlannerState(targetScopeKey, state),
    },
    targetScopeKey,
  );
}
