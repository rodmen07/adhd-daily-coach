/**
 * The onboarding preference record: one storage key, one place that knows how
 * to read it.
 *
 * There are two legitimate questions to ask about the stored record and they
 * have different right answers, so both live here rather than being re-derived
 * by each caller:
 *
 * - `getOnboardingPreferences()` - "is there a complete, trustworthy record?"
 *   Validates the whole object and returns null for anything else. This is the
 *   answer the dashboard needs when deciding whether a person has actually been
 *   through onboarding.
 * - `readOnboardingDefaults()` - "which individual preferences can I use?"
 *   Validates field by field and returns null per field, so a record that is
 *   partial or partly foreign still contributes what it legitimately has. This
 *   is the answer the planner needs when seeding a starting focus and dose.
 *
 * Both go through `ONBOARDING_STORAGE_KEY`. Before 2026-07-26 the key was
 * spelled in three more places (`planner-state.ts` kept a private copy of the
 * constant, `page.tsx` used the raw string literal twice) and the strict reader
 * here was imported by nobody, so the only validated reader in the codebase was
 * dead while the live ones each hand-rolled a different contract.
 * `src/__tests__/onboarding-storage-contract.test.ts` fails if a fourth
 * spelling appears.
 */
import { PARSE_FAILURE, isRecord, readEnum, type ParseResult } from "@/lib/parse";
import { DOSE_OPTIONS, FOCUS_AREAS, type DailyDose, type FocusArea } from "@/lib/plan";

const THEMES = ["light", "dark"] as const;

export type OnboardingPreferences = {
  defaultFocus: FocusArea;
  defaultDose: DailyDose;
  defaultTheme: (typeof THEMES)[number];
};

/**
 * The complete-record contract. Hand-written rather than schema-generated; the
 * primitives and the reason live in `@/lib/parse`.
 *
 * All three fields are required, so any one of them missing or foreign fails
 * the whole record - that is what makes this the STRICT reader, as opposed to
 * `readOnboardingDefaults` below.
 */
export const onboardingPreferencesSchema = {
  safeParse(value: unknown): ParseResult<OnboardingPreferences> {
    if (!isRecord(value)) {
      return PARSE_FAILURE;
    }

    const defaultFocus = readEnum(value.defaultFocus, FOCUS_AREAS);
    const defaultDose = readEnum(value.defaultDose, DOSE_OPTIONS);
    const defaultTheme = readEnum(value.defaultTheme, THEMES);

    if (defaultFocus === null || defaultDose === null || defaultTheme === null) {
      return PARSE_FAILURE;
    }

    return { success: true, data: { defaultFocus, defaultDose, defaultTheme } };
  },
};

/**
 * What the planner can salvage from the stored record, field by field. A null
 * field means "nothing usable was stored", never "the person chose nothing".
 */
export type OnboardingDefaults = {
  defaultFocus: FocusArea | null;
  defaultDose: DailyDose | null;
};

export const ONBOARDING_STORAGE_KEY = "calm-daily-coach:onboarding";

function noDefaults(): OnboardingDefaults {
  return { defaultFocus: null, defaultDose: null };
}

function readStoredRecord(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
}

/**
 * The strict read. Returns null unless the stored value parses AND satisfies
 * the whole schema, so a corrupt or foreign value reads as "not onboarded"
 * rather than as "onboarded with nothing".
 */
export function getOnboardingPreferences(): OnboardingPreferences | null {
  const stored = readStoredRecord();
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    const result = onboardingPreferencesSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * The tolerant read, moved here verbatim from `planner-state.ts`'s private
 * `applyOnboardingDefaults`. It deliberately does NOT use
 * `onboardingPreferencesSchema`: a record missing a field should still
 * contribute the fields it does have to the planner's starting state, which is
 * a different question from whether the record as a whole can be trusted.
 */
export function readOnboardingDefaults(): OnboardingDefaults {
  const stored = readStoredRecord();
  if (!stored) {
    return noDefaults();
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed)) {
      return noDefaults();
    }

    return {
      defaultFocus: readEnum(parsed.defaultFocus, FOCUS_AREAS),
      defaultDose: readEnum(parsed.defaultDose, DOSE_OPTIONS),
    };
  } catch {
    return noDefaults();
  }
}

export function saveOnboardingPreferences(prefs: OnboardingPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(prefs));
}
