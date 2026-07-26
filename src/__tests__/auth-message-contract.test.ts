/**
 * A page that offers sign-in must be able to say it failed.
 *
 * `useCoachAuth` is a plain hook, not a context, so it hands every caller a
 * private `authMessage` and cannot make anyone render it. Until v0.15 only one
 * of the three routes calling `signInWithGoogle` did: `/` rendered the alert
 * paragraph, while `/focus` and `/pricing` destructured the hook without
 * `authMessage` at all. On those pages a sign-in failure that does not
 * self-recover through the redirect fallback produced nothing - no text on
 * screen and nothing announced - and `/pricing` is the checkout entry point.
 *
 * The fix was one shared component. This guard is what keeps a fourth sign-in
 * surface from repeating the defect quietly, because "a hook returns a value
 * callers may silently drop" is a shape that recurs by construction rather
 * than by accident.
 *
 * It reads BOTH sources it depends on rather than hardcoding either:
 *
 * - `src/app/hooks/use-coach-auth.ts`, so renaming `authMessage` or
 *   `signInWithGoogle` fails here instead of leaving the scan below hunting
 *   for dead identifiers and reporting a clean tree;
 * - `src/app/components/auth-message.tsx`, so the accessibility contract
 *   (`role="alert"` + `aria-live="assertive"`) cannot be dropped from the one
 *   component every sign-in surface now depends on.
 *
 * Test files are excluded: a test legitimately renders the alert's markup
 * inline to assert against it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { shippedSourceFiles, withoutComments } from "@/__tests__/helpers/source-scan";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");

const AUTH_HOOK = "src/app/hooks/use-coach-auth.ts";
const ALERT_COMPONENT = "src/app/components/auth-message.tsx";
const ALERT_IMPORT = "@/app/components/auth-message";
const SIGN_IN_METHOD = "signInWithGoogle";
const MESSAGE_FIELD = "authMessage";

/**
 * Files that call `signInWithGoogle` and legitimately do NOT render the alert
 * themselves - a page whose sign-in button lives in a child component that
 * renders it, for instance. Empty today, and every entry is checked below for
 * staleness in both directions so it cannot outlive its reason.
 */
const ALLOWED_WITHOUT_ALERT: { file: string; reason: string }[] = [];

/** True when this source consumes the hook's sign-in method. */
export function offersSignIn(source: string): boolean {
  return withoutComments(source).includes(SIGN_IN_METHOD);
}

/** True when this source imports AND renders the shared alert component. */
export function rendersAuthMessage(source: string): boolean {
  const code = withoutComments(source);

  return code.includes(`from "${ALERT_IMPORT}"`) && /<AuthMessage[\s/>]/.test(code);
}

function relative(absolute: string): string {
  return path.relative(ROOT, absolute).replace(/\\/g, "/");
}

const APP_FILES = shippedSourceFiles(APP_DIR).map((absolute) => ({
  file: relative(absolute),
  source: readFileSync(absolute, "utf-8"),
}));

/** Only a `.tsx` file can render the component, so only those are judged. */
const COMPONENT_FILES = APP_FILES.filter(({ file }) => file.endsWith(".tsx"));

const SIGN_IN_SURFACES = COMPONENT_FILES.filter(({ source }) => offersSignIn(source)).map(
  ({ file }) => file,
);

describe("sign-in surfaces announce their own failures", () => {
  it("scans the identifiers the hook really exports", () => {
    const hook = APP_FILES.find(({ file }) => file === AUTH_HOOK);
    expect(hook, `${AUTH_HOOK} disappeared, so everything below is scanning for dead names`).toBeDefined();

    const code = withoutComments(hook!.source);
    expect(
      new RegExp(`^\\s*${MESSAGE_FIELD},`, "m").test(code),
      `the hook no longer returns ${MESSAGE_FIELD}; rename it here too, or this guard silently protects nothing`,
    ).toBe(true);
    expect(
      new RegExp(`^\\s*${SIGN_IN_METHOD},`, "m").test(code),
      `the hook no longer returns ${SIGN_IN_METHOD}; the scan below would find zero sign-in surfaces and pass`,
    ).toBe(true);
  });

  it("keeps the shared alert's accessibility contract", () => {
    const component = COMPONENT_FILES.find(({ file }) => file === ALERT_COMPONENT);
    expect(component, `${ALERT_COMPONENT} is the component every sign-in surface imports`).toBeDefined();

    const code = withoutComments(component!.source);
    expect(code.includes("export function AuthMessage"), "the component's export was renamed").toBe(true);
    expect(
      code.includes('role="alert"'),
      "the shared alert lost role=\"alert\", so two pages stop announcing sign-in failures at once",
    ).toBe(true);
    expect(
      code.includes('aria-live="assertive"'),
      "the shared alert lost aria-live=\"assertive\", which is how the failure reaches a screen reader",
    ).toBe(true);
  });

  it("reaches every corner of src/app before judging it (blindness control)", () => {
    // A walk that quietly stopped at one subtree would report "every sign-in
    // surface renders the alert" for the happiest of wrong reasons, so the
    // trees are named rather than trusted to a file count: `src/app/components`
    // alone already clears any plausible threshold.
    for (const tree of ["src/app/components/", "src/app/hooks/"]) {
      expect(
        APP_FILES.some(({ file }) => file.startsWith(tree)),
        `the walk never reached ${tree}, so a clean result there means nothing`,
      ).toBe(true);
    }

    const routeDirectories = new Set(
      COMPONENT_FILES.filter(({ file }) => file.endsWith("/page.tsx")).map(({ file }) =>
        path.posix.dirname(file),
      ),
    );
    expect(routeDirectories.size, "the walk found almost no routes under src/app").toBeGreaterThan(10);

    // The load-bearing control: if the matcher broke, this list would be empty
    // and the contract test below would pass without judging anything.
    expect(
      SIGN_IN_SURFACES.length,
      `no file under src/app appears to call ${SIGN_IN_METHOD}, which means the scan is blind, not that the app has no sign-in`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("makes every sign-in surface render the shared alert", () => {
    const exempt = new Set(ALLOWED_WITHOUT_ALERT.map((entry) => entry.file));

    const silent = COMPONENT_FILES.filter(
      ({ file, source }) => offersSignIn(source) && !rendersAuthMessage(source) && !exempt.has(file),
    ).map(({ file }) => file);

    expect(
      silent,
      `these files call ${SIGN_IN_METHOD} but never render <AuthMessage>, so a sign-in failure there is shown to nobody and announced to nobody: import it from "${ALERT_IMPORT}" and pass the hook's ${MESSAGE_FIELD}`,
    ).toEqual([]);
  });

  it("keeps the exemption list honest in both directions", () => {
    for (const entry of ALLOWED_WITHOUT_ALERT) {
      expect(entry.reason.length, `${entry.file} is exempt without a reason`).toBeGreaterThan(20);

      const found = COMPONENT_FILES.find(({ file }) => file === entry.file);
      expect(found, `${entry.file} is exempt but no longer exists`).toBeDefined();
      expect(
        offersSignIn(found!.source),
        `${entry.file} no longer offers sign-in, so its exemption is stale`,
      ).toBe(true);
      expect(
        rendersAuthMessage(found!.source),
        `${entry.file} now renders the alert, so its exemption is stale`,
      ).toBe(false);
    }
  });

  it("catches a silent surface and forgives prose (negative control)", () => {
    const caller = `const { ${MESSAGE_FIELD}, ${SIGN_IN_METHOD} } = useCoachAuth();`;

    expect(offersSignIn(caller), "a real call site must be caught").toBe(true);
    expect(
      offersSignIn(`/** This page does not call ${SIGN_IN_METHOD}. */\nexport default function P() {}`),
      "prose naming the method is documentation, not a call site",
    ).toBe(false);

    expect(
      rendersAuthMessage(`${caller}\nimport { AuthMessage } from "${ALERT_IMPORT}";\n<AuthMessage message={${MESSAGE_FIELD}} />`),
      "importing and rendering the component is the behaviour this guard wants",
    ).toBe(true);
    expect(
      rendersAuthMessage(`import { AuthMessage } from "${ALERT_IMPORT}";`),
      "importing without rendering leaves the failure invisible, which is the original defect",
    ).toBe(false);
    expect(
      rendersAuthMessage("<AuthMessage message={authMessage} />"),
      "rendering a name this file never imported would not compile, and must not count",
    ).toBe(false);
  });
});
