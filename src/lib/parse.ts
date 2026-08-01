/**
 * The three validation primitives this app actually needs, hand-written.
 *
 * WHY THIS EXISTS RATHER THAN A SCHEMA LIBRARY
 * --------------------------------------------
 * Two schemas in this repo validated untrusted records: the onboarding
 * preference record read out of localStorage, and the planner's input. Between
 * them they used exactly three rules - "one of this enum", "a string no longer
 * than N", and "this field may be absent" - and they cost a production
 * dependency whose weight is paid by every visitor on first paint and whose
 * advisories are gated by the blocking `npm audit --audit-level=high` step in
 * `ci.yml` (this repo's most frequent CI incident: PRs #99, #101, #102, #107).
 *
 * The bytes are recorded in docs/design/PERF_PASS.md section 3; the honesty
 * gate D5 asked for is that the number came from a measured counterfactual
 * build, not from a marker scan.
 *
 * WHAT IS DELIBERATELY PRESERVED
 * ------------------------------
 * The `safeParse(value) -> {success, data}` shape, because it is the surface
 * the existing tests describe and those tests are the behavior-preserving
 * receipt for this swap. Object validation also keeps zod's two defaults that
 * callers here rely on: unknown keys are STRIPPED rather than rejected (the
 * result is built from the known fields only), and a non-object input fails
 * rather than throwing.
 *
 * The tolerant, field-by-field reader in `onboarding.ts` is a different
 * question with a different answer and is NOT expressed here; see the module
 * comment there.
 */

/** Mirrors the `safeParse` result shape the schemas' callers already handle. */
export type ParseResult<T> = { success: true; data: T } | { success: false };

export const PARSE_FAILURE: ParseResult<never> = { success: false };

/**
 * Narrows an unknown value to an index-readable record.
 *
 * `typeof null === "object"` is the classic hole here, and arrays are objects
 * too: `["Fitness"]` must not read as a record whose fields happen to be
 * missing, which is what a bare `typeof` check would allow.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * "One of this enum, or nothing usable." Returns null rather than throwing, so
 * both the strict readers and the tolerant one can share it.
 *
 * `allowed` is the SAME array the rest of the app offers (FOCUS_AREAS,
 * DOSE_OPTIONS), never a second copy of it - the drift this repo already had
 * once, when onboarding's dose enum was a hardcoded duplicate of DOSE_OPTIONS
 * and a fourth dose would have been silently rejected.
 */
export function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * "A string no longer than `maxLength`, or nothing usable."
 *
 * Length is counted in UTF-16 code units, which is what `String.prototype
 * .length` reports and what zod's `.max()` compared against, so an emoji-heavy
 * note is measured identically before and after this swap.
 */
export function readBoundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length <= maxLength ? value : null;
}
