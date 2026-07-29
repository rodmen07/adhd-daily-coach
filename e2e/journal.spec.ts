import { test, expect, APP_ROOT, routeUrl } from "./fixtures";

/**
 * Journey J3 - the journal (docs/design/E2E_SMOKE.md D1).
 *
 * Write a gratitude entry on /journal, reload the page for real, and find the
 * entry still there; edit it and find the edit happened IN PLACE - one entry
 * per day, never a second record. The one-entry contract is asserted through
 * the "Earlier entries" panel staying empty: if an edit ever forked a new
 * record instead of upserting, the original would surface there.
 *
 * The console-error tripwire from ./fixtures is armed automatically.
 */

const JOURNAL_PATH = `${APP_ROOT}journal/`;
const FIRST_ENTRY = "Grateful for a quiet morning and a slow coffee.";
const EDITED_ENTRY = "Grateful for rain on the window while I worked.";

test.describe("J3: journal", () => {
  test("an entry survives a real reload, and editing edits in place", async ({
    page,
  }) => {
    // /journal has no onboarding overlay; a fresh context lands straight on
    // an empty journal.
    await page.goto(JOURNAL_PATH);
    await expect(page).toHaveURL(routeUrl("journal"));

    // Write today's entry.
    const editor = page.getByPlaceholder("A few words are plenty.");
    await editor.fill(FIRST_ENTRY);
    await page.getByRole("button", { name: "Save today's entry" }).click();
    await expect(page.getByTestId("journal-saved-note")).toBeVisible();
    await expect(page.getByText(FIRST_ENTRY)).toBeVisible();

    // The real reload: the entry must come back from storage, already in its
    // saved (non-editing) presentation.
    await page.reload();
    await expect(page.getByTestId("journal-saved-note")).toBeVisible();
    await expect(page.getByText(FIRST_ENTRY)).toBeVisible();

    // Edit in place. The editor reopens prefilled with what was saved - an
    // edit continues the day's entry, it never starts a blank one.
    await page.getByRole("button", { name: "Edit today's entry" }).click();
    await expect(editor).toHaveValue(FIRST_ENTRY);
    await editor.fill(EDITED_ENTRY);
    await page.getByRole("button", { name: "Save today's entry" }).click();

    await expect(page.getByText(EDITED_ENTRY)).toBeVisible();
    await expect(page.getByText(FIRST_ENTRY)).toHaveCount(0);

    // One entry per day: the edit replaced today's record, so nothing fell
    // through into the history panel.
    await expect(
      page.getByText("No earlier entries, and that is fine"),
    ).toBeVisible();

    // And the edited text is what persists across one more real reload.
    await page.reload();
    await expect(page.getByText(EDITED_ENTRY)).toBeVisible();
    await expect(page.getByText(FIRST_ENTRY)).toHaveCount(0);
    await expect(
      page.getByText("No earlier entries, and that is fine"),
    ).toBeVisible();
  });
});
