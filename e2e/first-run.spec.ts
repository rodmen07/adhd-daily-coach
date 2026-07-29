import { test, expect, APP_ROOT, routeUrl } from "./fixtures";

/**
 * Journey J1 - first run (docs/design/E2E_SMOKE.md D1).
 *
 * The first-run path only became reachable on 2026-07-26 (v0.14 removed the
 * sign-in wall), and every defect filed on it since was found by hand, not by
 * a test: the spinner-only deploy (PR #114), the silent sign-in (PR #123),
 * the onboarding hydration mismatch (PR #124). This journey walks that path
 * in a real browser against the real static export, served the way GitHub
 * Pages serves it (basePath + trailing slash, design decision D3).
 *
 * The console-error tripwire from ./fixtures is armed automatically on every
 * test in this file: a production React hydration mismatch surfaces as a
 * minified console.error, which fails the journey even when every visible
 * assertion passes.
 */

test.describe("J1: first run", () => {
  test("the served HTML is the dashboard, with no onboarding overlay baked in", async ({
    request,
  }) => {
    // The raw artifact, before any JavaScript runs: this is what Pages sends
    // to a first-time visitor, and what the client's first render pass must
    // match (v0.15 PR2's contract).
    const response = await request.get(APP_ROOT);
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("Today-first coaching");
    expect(html).not.toContain("onboarding-container");
    expect(html).not.toContain("Personalize your coach");
  });

  test("onboarding appears only after hydration, completes to a usable dashboard, and a reload keeps it closed", async ({
    page,
  }) => {
    // A Playwright test gets a fresh browser context: empty localStorage,
    // i.e. a genuine first-time visitor.
    await page.goto(APP_ROOT);

    // The URL bar reads the production shape (D3): basePath, trailing slash.
    await expect(page).toHaveURL(routeUrl());

    // The prerendered dashboard is visible immediately.
    await expect(
      page.getByRole("heading", { name: "Today-first coaching" }),
    ).toBeVisible();

    // The onboarding overlay appears for a first-time visitor. The previous
    // test proved it is absent from the served HTML, so its visibility here
    // is only reachable via hydration plus the deferred client settle -
    // together the two tests pin "after hydration, never before".
    const overlay = page.getByTestId("onboarding-container");
    await expect(overlay).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Personalize your coach" }),
    ).toBeVisible();

    // Completing onboarding ("Quick start now" accepts the recommended
    // preset) closes the overlay and leaves a usable dashboard.
    await page.getByRole("button", { name: "Quick start now" }).click();
    await expect(overlay).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Today-first coaching" }),
    ).toBeVisible();

    // A real page reload - the lifecycle jsdom tests cannot exercise.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Today-first coaching" }),
    ).toBeVisible();

    // Hydration fence: prove React is attached and handling events before
    // asserting the overlay's absence, so this cannot pass vacuously on a
    // page whose JavaScript never ran. The onboarding settle is queued as a
    // macrotask during the hydration effects, so by the time a click has
    // been handled by React, the settle has already run and the absence
    // below is the settled answer, not a not-yet answer.
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(
      page.getByRole("heading", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Keyboard shortcuts" }),
    ).toHaveCount(0);

    // The preference record written by "Quick start now" keeps onboarding
    // closed across the reload.
    await expect(overlay).toHaveCount(0);
  });
});
