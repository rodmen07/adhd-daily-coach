/**
 * The edges a hand-written validator is most likely to get wrong, pinned.
 *
 * v0.19 PR2 replaced two zod schemas with the primitives in `@/lib/parse`
 * (docs/design/PERF_PASS.md D5). The existing `onboarding.test.ts` and
 * `plan.test.ts` are the behavior-PRESERVING receipt for that swap: they were
 * written against zod, they were not touched, and they still pass. What they do
 * NOT cover is the set of inputs where a library and a hand-rolled check
 * quietly disagree, which is exactly where a swap like this goes wrong:
 *
 *   - `typeof null === "object"`, so a naive record check accepts `null`.
 *   - Arrays are objects too, so `["Fitness"]` can read as a record with
 *     missing fields instead of as the wrong shape entirely.
 *   - `z.object()` STRIPS unknown keys rather than rejecting them, and callers
 *     here store the parsed result straight back to localStorage.
 *   - An optional field has three states, not two: absent (fine), present and
 *     valid (fine), present and invalid (must fail the whole record). Folding
 *     the third into the first is how an over-long note gets saved as no note.
 *   - `.max(n)` is inclusive, so exactly `n` must pass and `n + 1` must fail.
 *
 * Each test below fails against a plausible wrong implementation of the
 * primitive it names, which is what makes it a proof rather than a restatement.
 */
import { describe, expect, it } from "vitest";
import { isRecord, readBoundedString, readEnum } from "@/lib/parse";
import {
  NOTES_MAX_LENGTH,
  dailyPlanInputSchema,
  DOSE_OPTIONS,
  FOCUS_AREAS,
} from "@/lib/plan";
import { onboardingPreferencesSchema } from "@/lib/onboarding";

describe("isRecord", () => {
  it("rejects null, which typeof calls an object", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("rejects arrays, which are objects with numeric keys", () => {
    expect(isRecord(["Fitness"])).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it("rejects primitives", () => {
    expect(isRecord("Fitness")).toBe(false);
    expect(isRecord(7)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it("accepts a plain object, including an empty one", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ focus: "Sleep" })).toBe(true);
  });
});

describe("readEnum", () => {
  it("accepts a member and returns it", () => {
    expect(readEnum("Sleep", FOCUS_AREAS)).toBe("Sleep");
  });

  it("rejects a non-member", () => {
    expect(readEnum("Napping", FOCUS_AREAS)).toBeNull();
  });

  it("rejects a non-string even when it could coerce", () => {
    // `[].includes` would happily match a boxed String, and a bare truthiness
    // check would pass `0`/`false` through to the caller as "a value".
    expect(readEnum(new String("Sleep"), FOCUS_AREAS)).toBeNull();
    expect(readEnum(null, DOSE_OPTIONS)).toBeNull();
    expect(readEnum(undefined, DOSE_OPTIONS)).toBeNull();
    expect(readEnum(0, DOSE_OPTIONS)).toBeNull();
  });
});

describe("readBoundedString", () => {
  it("is inclusive at the boundary", () => {
    expect(readBoundedString("x".repeat(280), 280)).toBe("x".repeat(280));
    expect(readBoundedString("x".repeat(281), 280)).toBeNull();
  });

  it("accepts the empty string, which is falsy but valid", () => {
    expect(readBoundedString("", 280)).toBe("");
  });

  it("rejects a non-string", () => {
    expect(readBoundedString(280, 280)).toBeNull();
    expect(readBoundedString(null, 280)).toBeNull();
  });
});

describe("dailyPlanInputSchema, at the edges", () => {
  const VALID = { focus: "Sleep", dose: "deep" } as const;

  it("rejects null and arrays rather than reading them as empty records", () => {
    expect(dailyPlanInputSchema.safeParse(null).success).toBe(false);
    expect(dailyPlanInputSchema.safeParse([]).success).toBe(false);
    expect(dailyPlanInputSchema.safeParse("Sleep").success).toBe(false);
  });

  it("strips unknown keys instead of copying them into the result", () => {
    const result = dailyPlanInputSchema.safeParse({ ...VALID, sneaky: "value" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(Object.keys(result.data).sort()).toEqual(["dose", "focus"]);
  });

  it("omits notes entirely when absent, rather than storing undefined", () => {
    const result = dailyPlanInputSchema.safeParse(VALID);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect("notes" in result.data).toBe(false);
  });

  it("accepts notes of exactly the cap and rejects one character more", () => {
    expect(
      dailyPlanInputSchema.safeParse({ ...VALID, notes: "x".repeat(NOTES_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      dailyPlanInputSchema.safeParse({ ...VALID, notes: "x".repeat(NOTES_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it("fails the record when notes is present but not a string", () => {
    // The failure mode this exists to catch: treating "invalid" as "absent",
    // which would silently accept the record and drop the note.
    expect(dailyPlanInputSchema.safeParse({ ...VALID, notes: 5 }).success).toBe(false);
    expect(dailyPlanInputSchema.safeParse({ ...VALID, notes: null }).success).toBe(false);
  });
});

describe("onboardingPreferencesSchema, at the edges", () => {
  const COMPLETE = {
    defaultFocus: "Fitness",
    defaultDose: "medium",
    defaultTheme: "light",
  } as const;

  it("rejects null and arrays", () => {
    expect(onboardingPreferencesSchema.safeParse(null).success).toBe(false);
    expect(onboardingPreferencesSchema.safeParse([]).success).toBe(false);
  });

  it("strips unknown keys, so a foreign field cannot be written back", () => {
    const result = onboardingPreferencesSchema.safeParse({ ...COMPLETE, extra: true });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(Object.keys(result.data).sort()).toEqual([
      "defaultDose",
      "defaultFocus",
      "defaultTheme",
    ]);
  });

  it("requires all three fields, so no field is quietly optional", () => {
    for (const missing of ["defaultFocus", "defaultDose", "defaultTheme"] as const) {
      const partial: Record<string, unknown> = { ...COMPLETE };
      delete partial[missing];

      expect(
        onboardingPreferencesSchema.safeParse(partial).success,
        `${missing} was dropped and the record still parsed`,
      ).toBe(false);
    }
  });
});
