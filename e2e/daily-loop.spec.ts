import { test, expect, APP_ROOT, routeUrl } from "./fixtures";

/**
 * Journey J2 - the daily loop (docs/design/E2E_SMOKE.md D1).
 *
 * Pick a focus and dose on /focus, generate the plan, check in on /execute,
 * and watch the dashboard ring read 100 percent - then reload the page for
 * real and watch it STILL read 100 percent. The reload is the point: the ring
 * resetting on reload was a real shipped defect (fixed in PR #90 by
 * persisting `SavedPlannerState.checkedIn`), and every jsdom test of that fix
 * remounts components, which is not the lifecycle the bug lived at. This
 * journey pins the fix at the page lifecycle itself.
 *
 * The focus and dose are deliberately NON-DEFAULT choices (the planner boots
 * with Deep Work / light), so the /execute assertions prove the picks carried
 * through rather than re-observing boot state.
 *
 * The console-error tripwire from ./fixtures is armed automatically.
 */

test.describe("J2: daily loop", () => {
  test("focus and dose picked, plan generated, checked in: the ring reads 100 and a real reload keeps it", async ({
    page,
  }) => {
    // A fresh context is a first-time visitor, so onboarding appears on the
    // dashboard; complete it the way J1 proved works, which also writes the
    // preference record that keeps it closed for the rest of the journey.
    await page.goto(APP_ROOT);
    await page.getByRole("button", { name: "Quick start now" }).click();
    await expect(page.getByTestId("onboarding-container")).toHaveCount(0);

    // Before anything happens, today's ring honestly reads zero. Without this
    // anchor, the closing 100-percent assertions could not distinguish "the
    // loop completed" from "the ring is a constant".
    await expect(
      page.getByRole("img", { name: "Today's progress: 0 percent" }),
    ).toBeVisible();

    // Step 1: Focus. Pick a focus area and a dose, neither of them the boot
    // default, then generate the plan.
    await page.getByRole("link", { name: "Start today's session" }).click();
    await expect(page).toHaveURL(routeUrl("focus"));

    await page.getByRole("button", { name: "Sleep", exact: true }).click();
    await page.getByRole("radio", { name: "Deep (30 min)" }).click();
    await page.getByRole("button", { name: "Generate plan" }).click();
    await expect(
      page.getByRole("heading", { name: "Plan ready" }),
    ).toBeVisible();

    // Step 2: Execute. The plan pills echo the exact picks made above -
    // focus, dose, and the dose's minute budget - proving the choices
    // travelled from /focus rather than falling back to defaults.
    await page.getByRole("link", { name: "Continue to Execute" }).click();
    await expect(page).toHaveURL(routeUrl("execute"));
    await expect(page.getByText("Sleep", { exact: true })).toBeVisible();
    await expect(page.getByText("deep", { exact: true })).toBeVisible();
    await expect(page.getByText("30 min", { exact: true })).toBeVisible();

    // Close the day.
    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(
      page.getByRole("button", { name: "✓ Logged complete" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Continue to Review" }),
    ).toBeVisible();

    // Back on the dashboard - a full page load, not a client-side hop, so
    // the state shown is what was actually persisted.
    await page.goto(APP_ROOT);
    await expect(
      page.getByRole("heading", { name: "Session complete" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Today's progress: 100 percent" }),
    ).toBeVisible();

    // The PR #90 lifecycle: reload the page for real. The ring must still
    // read 100, and onboarding must not resurface either.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Session complete" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Today's progress: 100 percent" }),
    ).toBeVisible();
    await expect(page.getByTestId("onboarding-container")).toHaveCount(0);
  });
});
