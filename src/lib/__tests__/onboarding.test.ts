/**
 * First dedicated coverage for `src/lib/onboarding.ts`, which shipped
 * 2026-06-28 and had none: `getOnboardingPreferences` - the only validated
 * reader of the onboarding record anywhere in the codebase - was imported by
 * nothing, and its body was the module's uncovered half.
 *
 * The two readers answer deliberately different questions about the same
 * stored bytes, so most of what follows pins the DIFFERENCE between them: the
 * strict reader must reject a record the tolerant reader still salvages a
 * field from. Collapsing them later would be a real behavior change, and these
 * tests are what makes that visible instead of silent.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  getOnboardingPreferences,
  onboardingPreferencesSchema,
  readOnboardingDefaults,
  saveOnboardingPreferences,
  type OnboardingPreferences,
} from "@/lib/onboarding";
import { DOSE_OPTIONS, FOCUS_AREAS } from "@/lib/plan";

const COMPLETE: OnboardingPreferences = {
  defaultFocus: "Fitness",
  defaultDose: "medium",
  defaultTheme: "light",
};

function store(value: string) {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, value);
}

describe("onboarding preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("the strict read", () => {
    it("reads back a complete record", () => {
      store(JSON.stringify(COMPLETE));

      expect(getOnboardingPreferences()).toEqual(COMPLETE);
    });

    it("reports nothing stored as not onboarded", () => {
      expect(getOnboardingPreferences()).toBeNull();
    });

    it("reports a corrupt record as not onboarded, not as onboarded with nothing", () => {
      store("this is not json");

      expect(getOnboardingPreferences()).toBeNull();
    });

    it("rejects a record missing a field", () => {
      store(JSON.stringify({ defaultFocus: "Fitness", defaultDose: "medium" }));

      expect(getOnboardingPreferences()).toBeNull();
    });

    it("rejects a record naming a focus area this app does not have", () => {
      store(JSON.stringify({ ...COMPLETE, defaultFocus: "Underwater Basket Weaving" }));

      expect(getOnboardingPreferences()).toBeNull();
    });

    it("rejects valid JSON that is not an object at all", () => {
      store("null");

      expect(getOnboardingPreferences()).toBeNull();
    });
  });

  describe("the tolerant read", () => {
    it("returns both preferences from a complete record", () => {
      store(JSON.stringify(COMPLETE));

      expect(readOnboardingDefaults()).toEqual({
        defaultFocus: "Fitness",
        defaultDose: "medium",
      });
    });

    it("still salvages the fields a partial record does have", () => {
      store(JSON.stringify({ defaultFocus: "Fitness" }));

      expect(readOnboardingDefaults()).toEqual({
        defaultFocus: "Fitness",
        defaultDose: null,
      });
      // The same input the strict reader must refuse. This asymmetry is the
      // reason both functions exist.
      expect(getOnboardingPreferences()).toBeNull();
    });

    it("drops a field whose value is not in this app's vocabulary", () => {
      store(JSON.stringify({ defaultFocus: "Fitness", defaultDose: "enormous" }));

      expect(readOnboardingDefaults()).toEqual({
        defaultFocus: "Fitness",
        defaultDose: null,
      });
    });

    it("returns nothing usable for a corrupt record", () => {
      store("this is not json");

      expect(readOnboardingDefaults()).toEqual({ defaultFocus: null, defaultDose: null });
    });

    it("returns nothing usable for valid JSON that is not an object", () => {
      store("null");

      expect(readOnboardingDefaults()).toEqual({ defaultFocus: null, defaultDose: null });
    });

    it("returns nothing usable when nothing is stored", () => {
      expect(readOnboardingDefaults()).toEqual({ defaultFocus: null, defaultDose: null });
    });
  });

  describe("the writer", () => {
    it("writes a record its own strict reader accepts", () => {
      saveOnboardingPreferences(COMPLETE);

      expect(getOnboardingPreferences()).toEqual(COMPLETE);
      expect(readOnboardingDefaults()).toEqual({
        defaultFocus: "Fitness",
        defaultDose: "medium",
      });
    });

    it("writes under the exported key, so every reader finds it", () => {
      saveOnboardingPreferences(COMPLETE);

      expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe(JSON.stringify(COMPLETE));
    });
  });

  describe("the schema's vocabulary", () => {
    // Reads BOTH sources: the schema here and the option lists in
    // `@/lib/plan`. The dose enum used to be a hardcoded second copy of
    // DOSE_OPTIONS, so adding a fourth dose to the planner would have left
    // onboarding silently rejecting it.
    it("accepts every focus area and dose the planner offers", () => {
      for (const defaultFocus of FOCUS_AREAS) {
        for (const defaultDose of DOSE_OPTIONS) {
          expect(
            onboardingPreferencesSchema.safeParse({
              defaultFocus,
              defaultDose,
              defaultTheme: "dark",
            }).success,
            `${defaultFocus} / ${defaultDose} is offered by the planner but rejected by onboarding`,
          ).toBe(true);
        }
      }
    });

    it("accepts nothing outside them (negative control)", () => {
      expect(
        onboardingPreferencesSchema.safeParse({ ...COMPLETE, defaultFocus: "Napping" }).success,
      ).toBe(false);
      expect(
        onboardingPreferencesSchema.safeParse({ ...COMPLETE, defaultDose: "enormous" }).success,
      ).toBe(false);
      expect(
        onboardingPreferencesSchema.safeParse({ ...COMPLETE, defaultTheme: "sepia" }).success,
      ).toBe(false);
    });
  });
});
