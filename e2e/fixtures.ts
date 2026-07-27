import { test as base, expect } from "@playwright/test";
import { E2E_BASE_PATH } from "../playwright.config";

/**
 * Shared fixture for every smoke journey: the console-error tripwire
 * (docs/design/E2E_SMOKE.md D1).
 *
 * Production React reports a hydration mismatch as a minified console.error,
 * which is exactly the defect class this suite exists to catch, so every
 * journey fails on ANY console.error (and any uncaught page error) that is
 * not explicitly allowlisted. The fixture is AUTOMATIC: a spec that imports
 * `test` from this file is guarded without opting in, so a forgotten
 * reference can never silently disarm the tripwire.
 *
 * The allowlist starts EMPTY by design and every entry added must carry a
 * reason string - the same convention theme-token-guard's
 * INTENTIONAL_EXCEPTIONS uses. An entry without a reason is a review defect.
 */
const CONSOLE_ERROR_ALLOWLIST: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  // (empty - see the doc comment above before adding anything)
];

/** The path every journey starts from, in the exact shape Pages serves. */
export const APP_ROOT = `${E2E_BASE_PATH}/`;

type SmokeFixtures = {
  /** Auto fixture: arms the tripwire on every page in every journey. */
  consoleErrorTripwire: void;
};

export const test = base.extend<SmokeFixtures>({
  consoleErrorTripwire: [
    async ({ context }, use) => {
      const errors: string[] = [];
      context.on("page", (page) => {
        page.on("console", (message) => {
          if (message.type() !== "error") {
            return;
          }
          const text = message.text();
          if (CONSOLE_ERROR_ALLOWLIST.some((entry) => entry.pattern.test(text))) {
            return;
          }
          errors.push(text);
        });
        page.on("pageerror", (error) => {
          errors.push(`pageerror: ${String(error)}`);
        });
      });

      await use();

      expect(
        errors,
        "console-error tripwire: the journey must not log errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
